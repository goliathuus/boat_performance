import type { TrackPoint } from '@/domain/types';

/**
 * Binary search to find the index where to insert a timestamp
 * Returns the index of the point before t, or -1 if t is before all points
 */
function binarySearch(points: TrackPoint[], t: number): number {
  let left = 0;
  let right = points.length - 1;

  if (points.length === 0 || t < points[0].t) {
    return -1;
  }
  if (t > points[right].t) {
    return right;
  }

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (points[mid].t === t) {
      return mid;
    } else if (points[mid].t < t) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return right; // Return the index of the point before t
}

/**
 * Interpolate position and speed at time t from a sorted array of points
 * Uses binary search for O(log n) performance
 */
export function interpolateFromPoints(
  points: TrackPoint[],
  t: number
): { lat: number; lon: number; sog?: number; cog?: number } | null {
  if (points.length === 0) {
    return null;
  }

  if (t < points[0].t) {
    return null; // Before start
  }

  if (t > points[points.length - 1].t) {
    return null; // After end
  }

  const idx = binarySearch(points, t);
  
  if (idx === -1) {
    return null;
  }

  // Exact match
  if (points[idx].t === t) {
    return {
      lat: points[idx].lat,
      lon: points[idx].lon,
      sog: points[idx].sog,
      cog: points[idx].cog,
    };
  }

  // Need to interpolate between idx and idx+1
  if (idx >= points.length - 1) {
    // At the end, return last point
    const last = points[points.length - 1];
    return {
      lat: last.lat,
      lon: last.lon,
      sog: last.sog,
      cog: last.cog,
    };
  }

  const p1 = points[idx];
  const p2 = points[idx + 1];

  const ratio = (t - p1.t) / (p2.t - p1.t);
  const lat = p1.lat + (p2.lat - p1.lat) * ratio;
  const lon = p1.lon + (p2.lon - p1.lon) * ratio;

  const result: { lat: number; lon: number; sog?: number; cog?: number } = {
    lat,
    lon,
  };

  if (p1.sog !== undefined && p2.sog !== undefined) {
    result.sog = p1.sog + (p2.sog - p1.sog) * ratio;
  } else if (p1.sog !== undefined) {
    result.sog = p1.sog;
  } else if (p2.sog !== undefined) {
    result.sog = p2.sog;
  }

  if (p1.cog !== undefined && p2.cog !== undefined) {
    // Handle angle wrap-around
    let diff = p2.cog - p1.cog;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    result.cog = p1.cog + diff * ratio;
    if (result.cog < 0) result.cog += 360;
    if (result.cog >= 360) result.cog -= 360;
  } else if (p1.cog !== undefined) {
    result.cog = p1.cog;
  } else if (p2.cog !== undefined) {
    result.cog = p2.cog;
  }

  return result;
}

/**
 * Find the closest point to a given time (no interpolation)
 * Uses binary search for O(log n) performance
 */
export function findClosestPoint(
  points: TrackPoint[],
  time: number
): TrackPoint | null {
  if (points.length === 0) {
    return null;
  }

  if (time < points[0].t) {
    return points[0]; // Return first point if before start
  }

  if (time > points[points.length - 1].t) {
    return points[points.length - 1]; // Return last point if after end
  }

  const idx = binarySearch(points, time);
  
  if (idx === -1) {
    return points[0];
  }

  // Exact match
  if (points[idx].t === time) {
    return points[idx];
  }

  // Find closest between idx and idx+1
  if (idx >= points.length - 1) {
    return points[points.length - 1];
  }

  const p1 = points[idx];
  const p2 = points[idx + 1];
  
  // Return the point closest to time
  const dist1 = Math.abs(time - p1.t);
  const dist2 = Math.abs(time - p2.t);
  
  return dist1 <= dist2 ? p1 : p2;
}

