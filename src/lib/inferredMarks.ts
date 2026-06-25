import type { TrackPoint } from '@/domain/types';
import type { SessionData } from '@/state/useReplayStore';
import { bearingDegrees, projectLatLonToXZ } from '@/lib/geo/localEnu';

export type InferredMarkCandidate = {
  id: string;
  lat: number;
  lon: number;
  score: number;
  hitCount: number;
  sessionCount: number;
};

export type ConfirmedCourseBuoy = {
  id: string;
  lat: number;
  lon: number;
};

const DEFAULT_GRID_M = 42;
const DEFAULT_MIN_TURN_DEG = 52;
const DEFAULT_MIN_LEG_M = 5;
const DEFAULT_MIN_SAMPLE_M = 6;
const MERGE_DIST_M = 48;
const MAX_CANDIDATES = 24;

export type DetectRoundingMarksOptions = {
  gridM?: number;
  minTurnDeg?: number;
  minLegM?: number;
  minSampleM?: number;
  mergeDistM?: number;
  maxCandidates?: number;
};

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function smallestTurnDeg(bearingA: number, bearingB: number): number {
  let d = Math.abs(bearingA - bearingB) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function subsampleMinDistance(points: TrackPoint[], minDistM: number): TrackPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const out: TrackPoint[] = [sorted[0]];
  let last = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    if (haversineM(last.lat, last.lon, p.lat, p.lon) >= minDistM) {
      out.push(p);
      last = p;
    }
  }
  const lastPt = sorted[sorted.length - 1];
  if (out[out.length - 1] !== lastPt) out.push(lastPt);
  return out;
}

type BinAgg = {
  sumLatW: number;
  sumLonW: number;
  wSum: number;
  hits: number;
  sessions: Set<string>;
};

function centroidOrigin(sessions: SessionData[]): { lat: number; lon: number } {
  let sLat = 0;
  let sLon = 0;
  let n = 0;
  for (const s of sessions) {
    for (const p of s.points) {
      sLat += p.lat;
      sLon += p.lon;
      n += 1;
    }
  }
  if (n === 0) return { lat: 46, lon: -1 };
  return { lat: sLat / n, lon: sLon / n };
}

function mergeCloseCandidates(
  items: Omit<InferredMarkCandidate, 'id'>[],
  mergeDistM: number
): Omit<InferredMarkCandidate, 'id'>[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const kept: Omit<InferredMarkCandidate, 'id'>[] = [];
  for (const c of sorted) {
    const dup = kept.some((k) => haversineM(k.lat, k.lon, c.lat, c.lon) < mergeDistM);
    if (!dup) kept.push(c);
  }
  return kept;
}

/**
 * Détecte des zones où les traces tournent fortement au même endroit (passages autour d'une bouée probable).
 */
export function detectRoundingMarksFromSessions(
  sessions: Map<string, SessionData>,
  visibleSessionIds: string[],
  options?: DetectRoundingMarksOptions
): InferredMarkCandidate[] {
  const gridM = options?.gridM ?? DEFAULT_GRID_M;
  const minTurnDeg = options?.minTurnDeg ?? DEFAULT_MIN_TURN_DEG;
  const minLegM = options?.minLegM ?? DEFAULT_MIN_LEG_M;
  const minSampleM = options?.minSampleM ?? DEFAULT_MIN_SAMPLE_M;
  const mergeDistM = options?.mergeDistM ?? MERGE_DIST_M;
  const maxCandidates = options?.maxCandidates ?? MAX_CANDIDATES;

  const list: SessionData[] = [];
  for (const id of visibleSessionIds) {
    const s = sessions.get(id);
    if (s && s.points.length >= 3) list.push(s);
  }
  if (list.length === 0) return [];

  const { lat: originLat, lon: originLon } = centroidOrigin(list);
  const bins = new Map<string, BinAgg>();

  const addBin = (lat: number, lon: number, weight: number, sessionId: string) => {
    const { x, z } = projectLatLonToXZ(lat, lon, originLat, originLon);
    const ix = Math.floor(x / gridM);
    const iz = Math.floor(z / gridM);
    const key = `${ix},${iz}`;
    let agg = bins.get(key);
    if (!agg) {
      agg = { sumLatW: 0, sumLonW: 0, wSum: 0, hits: 0, sessions: new Set() };
      bins.set(key, agg);
    }
    agg.sumLatW += lat * weight;
    agg.sumLonW += lon * weight;
    agg.wSum += weight;
    agg.hits += 1;
    agg.sessions.add(sessionId);
  };

  for (const session of list) {
    const pts = subsampleMinDistance(session.points, minSampleM);
    if (pts.length < 3) continue;

    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const d01 = haversineM(p0.lat, p0.lon, p1.lat, p1.lon);
      const d12 = haversineM(p1.lat, p1.lon, p2.lat, p2.lon);
      if (d01 < minLegM || d12 < minLegM) continue;

      const b1 = bearingDegrees(p0.lat, p0.lon, p1.lat, p1.lon);
      const b2 = bearingDegrees(p1.lat, p1.lon, p2.lat, p2.lon);
      const turn = smallestTurnDeg(b1, b2);
      if (turn < minTurnDeg) continue;

      const w = Math.min(turn, 110);
      addBin(p1.lat, p1.lon, w, session.id);
    }
  }

  const raw: Omit<InferredMarkCandidate, 'id'>[] = [];
  for (const agg of bins.values()) {
    if (agg.wSum <= 0 || agg.hits < 3) continue;
    const lat = agg.sumLatW / agg.wSum;
    const lon = agg.sumLonW / agg.wSum;
    const sessionCount = agg.sessions.size;
    const passesMulti = sessionCount >= 2 && agg.hits >= 4 && agg.wSum >= 95;
    const passesSingle = sessionCount === 1 && agg.hits >= 10 && agg.wSum >= 160;
    if (!passesMulti && !passesSingle) continue;
    raw.push({
      lat,
      lon,
      score: Math.round(agg.wSum),
      hitCount: agg.hits,
      sessionCount,
    });
  }

  const merged = mergeCloseCandidates(raw, mergeDistM);
  merged.sort((a, b) => b.score - a.score);
  const sliced = merged.slice(0, maxCandidates);

  return sliced.map((c) => ({
    ...c,
    id: crypto.randomUUID(),
  }));
}

export function excludeNearConfirmed(
  candidates: InferredMarkCandidate[],
  confirmed: ConfirmedCourseBuoy[],
  radiusM = 35
): InferredMarkCandidate[] {
  if (confirmed.length === 0) return candidates;
  return candidates.filter(
    (c) => !confirmed.some((co) => haversineM(c.lat, c.lon, co.lat, co.lon) < radiusM)
  );
}
