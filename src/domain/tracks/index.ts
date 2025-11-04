import L, { type LatLngBounds } from 'leaflet';
import type { TrackPoint, BoatTrack, RaceDataset } from '../types';
import { profiler } from '@/lib/performance';

/**
 * Merge multiple datasets by boat_id
 * If same boat_id appears in multiple datasets, merge their points
 */
export function mergeTracks(datasets: RaceDataset[]): RaceDataset {
  const boatMap = new Map<string, BoatTrack>();
  let tMin = Infinity;
  let tMax = -Infinity;

  for (const dataset of datasets) {
    for (const boat of dataset.boats) {
      if (boatMap.has(boat.id)) {
        // Merge points and sort
        const existing = boatMap.get(boat.id)!;
        existing.points = [...existing.points, ...boat.points].sort((a, b) => a.t - b.t);
      } else {
        boatMap.set(boat.id, { ...boat });
      }

      // Update time range
      if (boat.points.length > 0) {
        const boatMin = boat.points[0].t;
        const boatMax = boat.points[boat.points.length - 1].t;
        tMin = Math.min(tMin, boatMin);
        tMax = Math.max(tMax, boatMax);
      }
    }
  }

  return {
    boats: Array.from(boatMap.values()),
    tMin: tMin === Infinity ? 0 : tMin,
    tMax: tMax === -Infinity ? 0 : tMax,
  };
}

/**
 * Compute map bounds from all tracks
 */
export function computeBounds(boats: BoatTrack[]): LatLngBounds | null {
  if (boats.length === 0) return null;

  const allPoints: Array<[number, number]> = [];
  for (const boat of boats) {
    for (const point of boat.points) {
      allPoints.push([point.lat, point.lon]);
    }
  }

  if (allPoints.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const [lat, lon] of allPoints) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }

  return L.latLngBounds(
    [minLat, minLon],
    [maxLat, maxLon]
  );
}

/**
 * Interpolate angle considering wrap-around (0-360)
 */
function interpolateAngle(angle1: number, angle2: number, ratio: number): number {
  // Handle wrap-around
  let diff = angle2 - angle1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  
  let result = angle1 + diff * ratio;
  // Normalize to 0-360
  if (result < 0) result += 360;
  if (result >= 360) result -= 360;
  return result;
}

/**
 * Linear interpolation between two points for a given timestamp
 * Returns null if timestamp is outside the track range
 */
export function interpolatePosition(
  boat: BoatTrack,
  t: number
): { lat: number; lon: number; point?: TrackPoint } | null {
  return profiler.measure(
    'interpolatePosition',
    () => {
      if (boat.points.length === 0) return null;
      if (t < boat.points[0].t) return null;
      if (t > boat.points[boat.points.length - 1].t) return null;

      let comparisons = 0;

      // Find the two points to interpolate between
      for (let i = 0; i < boat.points.length - 1; i++) {
        comparisons++;
        const p1 = boat.points[i];
        const p2 = boat.points[i + 1];

        if (t === p1.t) {
          return { lat: p1.lat, lon: p1.lon, point: p1 };
        }
        if (t === p2.t) {
          return { lat: p2.lat, lon: p2.lon, point: p2 };
        }

        if (t > p1.t && t < p2.t) {
          // Linear interpolation
          const ratio = (t - p1.t) / (p2.t - p1.t);
          const lat = p1.lat + (p2.lat - p1.lat) * ratio;
          const lon = p1.lon + (p2.lon - p1.lon) * ratio;

          // Create interpolated point with optional fields
          const point: TrackPoint = {
            t,
            lat,
            lon,
            ...(p1.sog !== undefined && p2.sog !== undefined
              ? { sog: p1.sog + (p2.sog - p1.sog) * ratio }
              : {}),
            ...(p1.cog !== undefined && p2.cog !== undefined
              ? { cog: p1.cog + (p2.cog - p1.cog) * ratio }
              : {}),
            // Interpolate wind fields
            ...(p1.twd !== undefined && p2.twd !== undefined
              ? { twd: interpolateAngle(p1.twd, p2.twd, ratio) }
              : p1.twd !== undefined
                ? { twd: p1.twd }
                : p2.twd !== undefined
                  ? { twd: p2.twd }
                  : {}),
            ...(p1.awa !== undefined && p2.awa !== undefined
              ? { awa: interpolateAngle(p1.awa, p2.awa, ratio) }
              : p1.awa !== undefined
                ? { awa: p1.awa }
                : p2.awa !== undefined
                  ? { awa: p2.awa }
                  : {}),
            ...(p1.twa !== undefined && p2.twa !== undefined
              ? { twa: interpolateAngle(p1.twa, p2.twa, ratio) }
              : p1.twa !== undefined
                ? { twa: p1.twa }
                : p2.twa !== undefined
                  ? { twa: p2.twa }
                  : {}),
          };

          return { lat, lon, point };
        }
      }

      // Fallback: return last point
      const last = boat.points[boat.points.length - 1];
      return { lat: last.lat, lon: last.lon, point: last };
    },
    boat.points.length,
    boat.points.length
  );
}

/**
 * Get points up to a given timestamp
 */
export function getPointsUntilTime(boat: BoatTrack, t: number): TrackPoint[] {
  return profiler.measure(
    'getPointsUntilTime',
    () => {
      const filtered = boat.points.filter((p) => p.t <= t);
      // Record additional metric with element count
      if (profiler.isEnabled()) {
        profiler.recordMetric('getPointsUntilTime', 0, filtered.length, boat.points.length);
      }
      return filtered;
    },
    boat.points.length,
    boat.points.length
  );
}

/**
 * Filter boat points by time range [start, end]
 */
export function filterPointsByTimeRange(boat: BoatTrack, timeRange: [number, number]): BoatTrack {
  const [start, end] = timeRange;
  const filteredPoints = boat.points.filter((p) => p.t >= start && p.t <= end);
  return {
    ...boat,
    points: filteredPoints,
  };
}

/**
 * Filter all boats in a dataset by time range
 */
export function filterDatasetByTimeRange(
  dataset: RaceDataset,
  timeRange: [number, number]
): RaceDataset {
  const filteredBoats = dataset.boats.map((boat) => filterPointsByTimeRange(boat, timeRange));
  return {
    ...dataset,
    boats: filteredBoats,
  };
}

/**
 * Calculate destination point given start point, bearing, and distance
 * Uses Haversine formula
 * @param lat Latitude in degrees
 * @param lon Longitude in degrees
 * @param bearing Bearing in degrees (0 = North, 90 = East)
 * @param distanceMeters Distance in meters
 * @returns [lat, lon] of destination point
 */
export function calculateDestPoint(
  lat: number,
  lon: number,
  bearing: number,
  distanceMeters: number
): [number, number] {
  const R = 6371000; // Earth radius in meters
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const bearingRad = (bearing * Math.PI) / 180;
  const d = distanceMeters / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearingRad)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

/**
 * Calculate rolling average SOG over a time window
 * @param boat Boat track
 * @param currentTime Current timestamp in ms
 * @param windowSeconds Time window in seconds (default 30)
 * @returns Average SOG or null if no data
 */
export function calculateAverageSOG(
  boat: BoatTrack,
  currentTime: number,
  windowSeconds: number = 30
): number | null {
  return profiler.measure(
    'calculateAverageSOG',
    () => {
      const windowStart = currentTime - windowSeconds * 1000;
      const windowEnd = currentTime;

      const pointsInWindow = boat.points.filter(
        (p) => p.t >= windowStart && p.t <= windowEnd && p.sog !== undefined
      );

      if (pointsInWindow.length === 0) {
        return null;
      }

      const sum = pointsInWindow.reduce((acc, p) => acc + (p.sog || 0), 0);
      const result = sum / pointsInWindow.length;
      // Record additional metric with element count
      if (profiler.isEnabled()) {
        profiler.recordMetric('calculateAverageSOG', 0, pointsInWindow.length, boat.points.length);
      }
      return result;
    },
    boat.points.length,
    boat.points.length
  );
}