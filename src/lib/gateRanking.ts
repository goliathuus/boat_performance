import type { Gate, Crossing, Result, BoatTrack } from '@/types';
import { calculateDistance } from '@/domain/tracks';

/**
 * 2D vector type for pixel-space calculations
 */
export type Vec2 = { x: number; y: number };

/**
 * Projection function: converts lat/lon to pixel coordinates
 */
export type ProjectFn = (lon: number, lat: number) => Vec2;

/**
 * Calculate cross product of two vectors (for orientation)
 */
function cross(v1: Vec2, v2: Vec2): number {
  return v1.x * v2.y - v1.y * v2.x;
}

/**
 * Calculate side of point P relative to line segment AB
 * Returns positive if P is on one side, negative on the other, ~0 if on the line
 */
function side(A: Vec2, B: Vec2, P: Vec2): number {
  return cross({ x: B.x - A.x, y: B.y - A.y }, { x: P.x - A.x, y: P.y - A.y });
}

/**
 * Check if two bounding boxes intersect
 */
function bboxIntersect(
  min1: Vec2,
  max1: Vec2,
  min2: Vec2,
  max2: Vec2
): boolean {
  return !(max1.x < min2.x || min1.x > max2.x || max1.y < min2.y || min1.y > max2.y);
}

/**
 * Get bounding box of a segment
 */
function getSegmentBbox(p1: Vec2, p2: Vec2): { min: Vec2; max: Vec2 } {
  return {
    min: { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y) },
    max: { x: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y) },
  };
}

/**
 * Segment-segment intersection in 2D
 * Returns null if no intersection, or { u, v, x, y } where:
 * - u: parameter on segment p->p2 (0-1)
 * - v: parameter on segment q->q2 (0-1)
 * - x, y: intersection point in pixel coordinates
 */
export function segSegIntersection(
  p: Vec2,
  p2: Vec2,
  q: Vec2,
  q2: Vec2,
  eps: number = 1e-9
): { u: number; v: number; x: number; y: number } | null {
  const r = { x: p2.x - p.x, y: p2.y - p.y };
  const s = { x: q2.x - q.x, y: q2.y - q.y };
  const qp = { x: q.x - p.x, y: q.y - p.y };

  const rxs = cross(r, s);
  const qpxr = cross(qp, r);

  // Parallel segments
  if (Math.abs(rxs) < eps) {
    return null;
  }

  const u = qpxr / rxs;
  const t = cross(qp, s) / rxs;

  // Check if intersection is within both segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      u: t,
      v: u,
      x: p.x + t * r.x,
      y: p.y + t * r.y,
    };
  }

  return null;
}

/**
 * Find crossings of a boat track with a gate
 * Returns array of crossings (oriented: boat crosses from negative to positive side)
 */
export function findCrossings(
  boat: BoatTrack,
  gate: Gate,
  project: ProjectFn
): Crossing[] {
  if (boat.points.length < 2) return [];

  const crossings: Crossing[] = [];
  const gateA = project(gate.a.lon, gate.a.lat);
  const gateB = project(gate.b.lon, gate.b.lat);

  // Gate bbox for early rejection
  const gateBbox = getSegmentBbox(gateA, gateB);

  for (let i = 0; i < boat.points.length - 1; i++) {
    const p0 = boat.points[i];
    const p1 = boat.points[i + 1];

    // Project boat segment to pixel space
    const boatP0 = project(p0.lon, p0.lat);
    const boatP1 = project(p1.lon, p1.lat);

    // Early rejection: check bbox intersection
    const boatBbox = getSegmentBbox(boatP0, boatP1);
    if (!bboxIntersect(gateBbox.min, gateBbox.max, boatBbox.min, boatBbox.max)) {
      continue;
    }

    // Check intersection
    const intersection = segSegIntersection(boatP0, boatP1, gateA, gateB);
    if (!intersection) continue;

    // Check orientation: boat must cross from negative to positive side
    // (or positive to negative, but we need a consistent direction)
    const side0 = side(gateA, gateB, boatP0);
    const side1 = side(gateA, gateB, boatP1);

    // Valid crossing: side changes sign (and not both ~0)
    const eps = 1e-6;
    if (Math.abs(side0) < eps && Math.abs(side1) < eps) {
      // Both points on the line - skip or handle specially
      continue;
    }

    // Crossing: side0 and side1 have opposite signs
    if (side0 * side1 < 0) {
      // Interpolate timestamp and position
      const u = intersection.u;
      const tCross = p0.t + u * (p1.t - p0.t);
      const latCross = p0.lat + u * (p1.lat - p0.lat);
      const lonCross = p0.lon + u * (p1.lon - p0.lon);

      crossings.push({
        boatId: boat.id,
        gate: 'start', // Will be set by caller based on gate type
        t: tCross,
        lat: latCross,
        lon: lonCross,
        segIndex: i,
        u: u,
      });
    }
  }

  return crossings;
}

/**
 * Compute gate rankings for all boats
 * Returns results sorted by elapsed time, and crossings grouped by boat
 */
export function computeGateRankings(
  boats: BoatTrack[],
  gateStart: Gate | null,
  gateFinish: Gate | null,
  project: ProjectFn
): {
  results: Result[];
  crossingsByBoat: Map<string, { start?: Crossing; finish?: Crossing }>;
} {
  const results: Result[] = [];
  const crossingsByBoat = new Map<string, { start?: Crossing; finish?: Crossing }>();

  // Need both gates to compute rankings
  if (!gateStart || !gateFinish) {
    return { results: [], crossingsByBoat };
  }

  // Find crossings for each boat
  for (const boat of boats) {
    const startCrossings = findCrossings(boat, gateStart, project);
    const finishCrossings = findCrossings(boat, gateFinish, project);

    // Mark gate type
    startCrossings.forEach((c) => {
      c.gate = 'start';
    });
    finishCrossings.forEach((c) => {
      c.gate = 'finish';
    });

    // Find first start crossing (oriented)
    const firstStart = startCrossings.length > 0 ? startCrossings[0] : null;

    // Find first finish crossing after start
    let firstFinish: Crossing | null = null;
    if (firstStart) {
      for (const finish of finishCrossings) {
        // Finish must be after start (by timestamp or segment index)
        if (
          finish.t > firstStart.t ||
          (finish.t === firstStart.t && finish.segIndex > firstStart.segIndex) ||
          (finish.segIndex === firstStart.segIndex && finish.u > firstStart.u)
        ) {
          firstFinish = finish;
          break;
        }
      }
    }

    // Store crossings for this boat
    if (firstStart || firstFinish) {
      crossingsByBoat.set(boat.id, {
        start: firstStart || undefined,
        finish: firstFinish || undefined,
      });
    }

    // Only create result if both crossings exist and finish is after start
    if (firstStart && firstFinish && firstFinish.t > firstStart.t) {
      const elapsedMs = firstFinish.t - firstStart.t;
      
      // Calculate TRUE distance traveled along the track between crossings
      // Find all points between start and finish crossings
      let totalDistanceMeters = 0;
      
      // Find the segment indices for start and finish
      const startSegIndex = firstStart.segIndex;
      const finishSegIndex = firstFinish.segIndex;
      
      // If start and finish are on the same segment
      if (startSegIndex === finishSegIndex) {
        // Just calculate distance between the two crossing points on this segment
        totalDistanceMeters = calculateDistance(
          firstStart.lat,
          firstStart.lon,
          firstFinish.lat,
          firstFinish.lon
        );
      } else {
        // Calculate distance from start crossing to end of its segment
        if (startSegIndex < boat.points.length - 1) {
          const startP1 = boat.points[startSegIndex + 1];
          const startCrossLat = firstStart.lat;
          const startCrossLon = firstStart.lon;
          
          // Distance from crossing point to end of start segment
          totalDistanceMeters += calculateDistance(
            startCrossLat,
            startCrossLon,
            startP1.lat,
            startP1.lon
          );
        }
        
        // Add distances for all complete segments between start and finish
        for (let i = startSegIndex + 1; i < finishSegIndex; i++) {
          if (i < boat.points.length - 1) {
            totalDistanceMeters += calculateDistance(
              boat.points[i].lat,
              boat.points[i].lon,
              boat.points[i + 1].lat,
              boat.points[i + 1].lon
            );
          }
        }
        
        // Calculate distance from start of finish segment to finish crossing
        if (finishSegIndex < boat.points.length - 1) {
          const finishP0 = boat.points[finishSegIndex];
          const finishCrossLat = firstFinish.lat;
          const finishCrossLon = firstFinish.lon;
          
          // Distance from start of finish segment to crossing point
          totalDistanceMeters += calculateDistance(
            finishP0.lat,
            finishP0.lon,
            finishCrossLat,
            finishCrossLon
          );
        }
      }
      
      // Convert to nautical miles (1 NM = 1852 meters)
      const distanceNm = totalDistanceMeters / 1852;
      
      // Calculate TRUE average speed in knots
      // elapsedMs is in milliseconds, convert to hours: elapsedMs / (1000 * 3600)
      const elapsedHours = elapsedMs / (1000 * 3600);
      const avgSpeed = elapsedHours > 0 ? distanceNm / elapsedHours : 0;
      
      results.push({
        boatId: boat.id,
        name: boat.name,
        tStart: firstStart.t,
        tFinish: firstFinish.t,
        elapsedMs,
        avgSpeed,
        distanceNm,
      });
    }
  }

  // Sort by elapsed time (ascending)
  results.sort((a, b) => a.elapsedMs - b.elapsedMs);

  return { results, crossingsByBoat };
}

