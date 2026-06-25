/** Mean Earth radius (m). */
export const EARTH_RADIUS_M = 6371000;

/**
 * Local tangent plane ENU-style metres from a fixed origin.
 * Three.js: Y up; horizontal plane uses X = east, Z = north (nautical charts: COG 0° = +Z).
 */
export function projectLatLonToXZ(
  lat: number,
  lon: number,
  originLat: number,
  originLon: number
): { x: number; z: number } {
  const φ = (originLat * Math.PI) / 180;
  const dλ = ((lon - originLon) * Math.PI) / 180;
  const dφ = ((lat - originLat) * Math.PI) / 180;
  const x = EARTH_RADIUS_M * Math.cos(φ) * dλ;
  const z = EARTH_RADIUS_M * dφ;
  return { x, z };
}

/**
 * Initial bearing from point A to B (degrees, 0–360, clockwise from north).
 */
export function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let θ = (Math.atan2(y, x) * 180) / Math.PI;
  θ = (θ + 360) % 360;
  return θ;
}

/**
 * Rotation about Three.js Y so mesh forward (+X) aligns with COG (nautical, clockwise from north).
 */
export function cogToYawRadians(cogDeg: number): number {
  // With world axes X=east, Z=north and object local forward=+X:
  // COG 0° (north)  -> yaw -90°
  // COG 90° (east)  -> yaw   0°
  // COG 180° (south)-> yaw +90°
  const yaw = (cogDeg * Math.PI) / 180 - Math.PI / 2;
  // Normalize to [-PI, PI] for stable interpolation/consistency
  const twoPi = Math.PI * 2;
  let n = ((yaw + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  if (Object.is(n, -0)) n = 0;
  return n;
}
