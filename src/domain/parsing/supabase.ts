import { supabase } from '@/lib/supabase';
import type { RaceDataset, BoatTrack, TrackPoint } from '../types';
import { generateBoatColor } from '@/lib/color';
import { calculateDistance } from '../tracks';

interface TelemetryRow {
  ts: string; // timestamptz
  lat: number;
  lon: number;
  speed: number | null;
  heading: number | null;
  meta: Record<string, unknown> | null;
}

/**
 * Load session data from Supabase and convert to RaceDataset
 */
export async function loadSessionData(sessionId: string, userId: string): Promise<RaceDataset> {
  // Fetch telemetry data for this session
  const { data, error } = await supabase
    .from('telemetry')
    .select('ts, lat, lon, speed, heading, meta')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('ts', { ascending: true });

  if (error) {
    throw new Error(`Failed to load telemetry data: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('No telemetry data found for this session');
  }

  // Group points by boat_id (from meta)
  const boatMap = new Map<string, { name: string; points: TrackPoint[] }>();

  for (const row of data as TelemetryRow[]) {
    // Extract boat_id and boat_name from meta
    const meta = row.meta || {};
    const boatId = (meta.boat_id as string) || (meta.boat_name as string) || sessionId;
    const boatName = (meta.boat_name as string) || (meta.boat_id as string) || 'Boat';

    // Convert timestamptz to epoch milliseconds
    const t = new Date(row.ts).getTime();

    // Create TrackPoint
    const point: TrackPoint = {
      t,
      lat: row.lat,
      lon: row.lon,
    };

    // Add speed (prefer meta.sog, fallback to speed column)
    const sog = (meta.sog as number) ?? row.speed;
    if (sog !== null && sog !== undefined) {
      point.sog = sog;
    }

    // Add course (prefer meta.cog, fallback to heading column)
    const cog = (meta.cog as number) ?? row.heading;
    if (cog !== null && cog !== undefined) {
      point.cog = cog;
    }

    // Add wind data from meta
    if (meta.twd !== null && meta.twd !== undefined) {
      let twd = Number(meta.twd);
      if (twd < 0) twd += 360;
      if (twd >= 360) twd -= 360;
      point.twd = twd;
    }

    if (meta.awa !== null && meta.awa !== undefined) {
      let awa = Number(meta.awa);
      if (awa < 0) awa += 360;
      if (awa >= 360) awa -= 360;
      point.awa = awa;
    }

    if (meta.twa !== null && meta.twa !== undefined) {
      let twa = Number(meta.twa);
      if (twa < 0) twa += 360;
      if (twa >= 360) twa -= 360;
      point.twa = twa;
    }

    // Add any other meta fields
    Object.keys(meta).forEach((key) => {
      if (!['boat_id', 'boat_name', 'sog', 'cog', 'twd', 'awa', 'twa'].includes(key)) {
        point[key] = meta[key];
      }
    });

    // Add to boat map
    if (!boatMap.has(boatId)) {
      boatMap.set(boatId, { name: boatName, points: [] });
    }

    boatMap.get(boatId)!.points.push(point);
  }

  // Convert to BoatTrack array
  const boats: BoatTrack[] = [];
  let tMin = Infinity;
  let tMax = -Infinity;

  for (const [boatId, { name, points }] of boatMap.entries()) {
    if (points.length === 0) continue;

    // Sort points by time
    points.sort((a, b) => a.t - b.t);

    // Calculate SOG for points where it's missing
    for (let i = 1; i < points.length; i++) {
      const currentPoint = points[i];
      const previousPoint = points[i - 1];

      // If SOG is not available, calculate it from lat/lon
      if (currentPoint.sog === undefined || currentPoint.sog === null) {
        const timeDiff = (currentPoint.t - previousPoint.t) / 1000; // in seconds

        // Only calculate if time elapsed is reasonable (between 0.1s and 60s)
        if (timeDiff > 0.1 && timeDiff < 60) {
          const distance = calculateDistance(
            previousPoint.lat,
            previousPoint.lon,
            currentPoint.lat,
            currentPoint.lon
          );

          // Convert m/s to knots (1 m/s = 1.944 knots)
          const sogKnots = (distance / timeDiff) * 1.944;

          // Limit to reasonable values (0-50 knots)
          if (sogKnots >= 0 && sogKnots <= 50) {
            currentPoint.sog = sogKnots;
          }
        }
      }
    }

    // Update time range
    const boatTMin = points[0].t;
    const boatTMax = points[points.length - 1].t;
    tMin = Math.min(tMin, boatTMin);
    tMax = Math.max(tMax, boatTMax);

    boats.push({
      id: boatId,
      name,
      color: generateBoatColor(boatId),
      points,
    });
  }

  if (boats.length === 0) {
    throw new Error('No valid boat tracks found in session data');
  }

  return {
    boats,
    tMin,
    tMax,
  };
}

