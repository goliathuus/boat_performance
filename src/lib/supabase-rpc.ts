import { supabase } from './supabase';
import type { TrackPoint } from '@/domain/types';

/**
 * Call Supabase RPC to get bucketed telemetry data (downsampled)
 * Returns one point per time bucket
 */
export async function getTelemetryBucketed(
  sessionId: string,
  startTs: Date,
  endTs: Date,
  bucketSeconds: number = 10
): Promise<TrackPoint[]> {

  const { data, error } = await supabase.rpc('get_telemetry_bucketed', {
    p_session_id: sessionId,
    p_start_ts: startTs.toISOString(),
    p_end_ts: endTs.toISOString(),
    p_bucket_seconds: bucketSeconds,
  });

  if (error) {
    console.error('[getTelemetryBucketed] RPC error details', {
      error,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      params: {
        p_session_id: sessionId,
        p_start_ts: startTs.toISOString(),
        p_end_ts: endTs.toISOString(),
        p_bucket_seconds: bucketSeconds,
      },
    });
    throw new Error(`Failed to get bucketed telemetry: ${error.message} (${error.code})`);
  }

  if (!data) {
    return [];
  }

  // Convert to TrackPoint[]
  return data.map((row: any) => ({
    t: new Date(row.ts).getTime(),
    lat: row.lat,
    lon: row.lon,
    sog: row.speed ?? undefined,
    cog: row.heading ?? undefined,
  }));
}

/**
 * Call Supabase RPC to get telemetry window with automatic downsampling
 * Returns points in the time window, downsampled if needed
 */
export async function getTelemetryWindow(
  sessionId: string,
  startTs: Date,
  endTs: Date,
  maxPoints: number = 20000
): Promise<TrackPoint[]> {

  const { data, error } = await supabase.rpc('get_telemetry_window', {
    p_session_id: sessionId,
    p_start_ts: startTs.toISOString(),
    p_end_ts: endTs.toISOString(),
    p_max_points: maxPoints,
  });

  if (error) {
    console.error('[getTelemetryWindow] RPC error details', {
      error,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      params: {
        p_session_id: sessionId,
        p_start_ts: startTs.toISOString(),
        p_end_ts: endTs.toISOString(),
        p_max_points: maxPoints,
      },
    });
    throw new Error(`Failed to get telemetry window: ${error.message} (${error.code})`);
  }

  if (!data) {
    return [];
  }

  // No warning for empty data - it's normal if a session has no telemetry

  // Convert to TrackPoint[]
  return data.map((row: any) => {
    const point: TrackPoint = {
      t: new Date(row.ts).getTime(),
      lat: row.lat,
      lon: row.lon,
    };

    if (row.speed !== null && row.speed !== undefined) {
      point.sog = row.speed;
    }
    if (row.heading !== null && row.heading !== undefined) {
      point.cog = row.heading;
    }

    // Extract meta fields
    if (row.meta) {
      const meta = row.meta as Record<string, unknown>;
      if (meta.sog !== null && meta.sog !== undefined) {
        point.sog = meta.sog as number;
      }
      if (meta.cog !== null && meta.cog !== undefined) {
        point.cog = meta.cog as number;
      }
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
    }

    return point;
  });
}

/**
 * Get telemetry using keyset pagination (fallback if RPC not available)
 */
export async function getTelemetryKeyset(
  sessionId: string,
  startTs: Date,
  endTs: Date,
  lastTs?: Date,
  pageSize: number = 10000
): Promise<{ points: TrackPoint[]; hasMore: boolean; lastTimestamp: Date | null }> {
  let query = supabase
    .from('telemetry')
    .select('ts, lat, lon, speed, heading, meta')
    .eq('session_id', sessionId)
    .gte('ts', startTs.toISOString())
    .lte('ts', endTs.toISOString())
    .order('ts', { ascending: true })
    .limit(pageSize);

  if (lastTs) {
    query = query.gt('ts', lastTs.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get telemetry: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { points: [], hasMore: false, lastTimestamp: null };
  }

  const points: TrackPoint[] = data.map((row: any) => {
    const point: TrackPoint = {
      t: new Date(row.ts).getTime(),
      lat: row.lat,
      lon: row.lon,
    };

    const meta = row.meta || {};
    const sog = (meta.sog as number) ?? row.speed;
    const cog = (meta.cog as number) ?? row.heading;

    if (sog !== null && sog !== undefined) {
      point.sog = sog;
    }
    if (cog !== null && cog !== undefined) {
      point.cog = cog;
    }

    return point;
  });

  const lastTimestamp = data.length > 0 ? new Date(data[data.length - 1].ts) : null;
  const hasMore = data.length === pageSize;

  return { points, hasMore, lastTimestamp };
}

/**
 * Get all telemetry data for a session without downsampling
 * Uses keyset pagination to fetch the full dataset
 */
export async function getTelemetryAll(
  sessionId: string,
  startTs: Date,
  endTs: Date,
  pageSize: number = 10000
): Promise<TrackPoint[]> {
  const allPoints: TrackPoint[] = [];
  let lastTs: Date | undefined;
  let hasMore = true;

  while (hasMore) {
    const { points, hasMore: more, lastTimestamp } = await getTelemetryKeyset(
      sessionId,
      startTs,
      endTs,
      lastTs,
      pageSize
    );

    if (points.length === 0) {
      break;
    }

    allPoints.push(...points);
    hasMore = more;
    lastTs = lastTimestamp ?? undefined;

    if (!lastTs) {
      break;
    }
  }

  return allPoints;
}

