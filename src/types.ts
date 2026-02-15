// Gate Ranking Types
// These types align with domain/types.ts for TrackPoint and BoatTrack

export type TrackPoint = {
  lat: number;
  lon: number;
  t: number; // timestamp in ms (Date.getTime()) or seconds
};

export type BoatTrack = {
  id: string;
  name: string;
  points: TrackPoint[];
};

export type Gate = {
  a: { lat: number; lon: number };
  b: { lat: number; lon: number };
};

export type Crossing = {
  boatId: string;
  gate: 'start' | 'finish';
  t: number; // timestamp
  lat: number;
  lon: number;
  segIndex: number; // index of segment in boat track (0-based, refers to segment between points[i] and points[i+1])
  u: number; // interpolation parameter on segment (0-1)
};

export type Result = {
  boatId: string;
  name: string;
  tStart: number;
  tFinish: number;
  elapsedMs: number;
  avgSpeed: number; // Average speed in knots
  distanceNm: number; // Distance traveled in nautical miles
  avgCOG?: number; // Average Course Over Ground in degrees (0-360)
};

