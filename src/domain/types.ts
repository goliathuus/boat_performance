export type TrackPoint = {
  t: number; // epoch ms
  lat: number;
  lon: number;
  sog?: number; // speed over ground, kn
  cog?: number; // course over ground, degrees
  twd?: number; // True Wind Direction (degrees, 0-360)
  awa?: number; // Apparent Wind Angle (degrees, -180 to 180 or 0-360)
  twa?: number; // True Wind Angle (degrees, -180 to 180 or 0-360)
  [k: string]: unknown; // allow other telemetry fields
};

export type BoatTrack = {
  id: string;
  name: string;
  color: string; // assigned by UI
  points: TrackPoint[];
};

export type RaceDataset = {
  boats: BoatTrack[];
  tMin: number;
  tMax: number;
};
