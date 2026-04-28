import { supabase } from './supabase';
import type { TrackPoint } from '@/domain/types';

export interface PublicEventMeta {
  id: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
}

export interface PublicEventSession {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  boat_id: string | null;
  event_id: string;
  boat_display_name: string | null;
}

export async function getPublicEventByToken(token: string): Promise<PublicEventMeta | null> {
  const { data, error } = await supabase.rpc('public_get_event_by_token', {
    p_token: token,
  });

  if (error) {
    throw new Error(`Failed to load public event: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0] as PublicEventMeta;
}

export async function getPublicEventSessions(token: string): Promise<PublicEventSession[]> {
  const { data, error } = await supabase.rpc('public_get_event_sessions', {
    p_token: token,
  });

  if (error) {
    throw new Error(`Failed to load public sessions: ${error.message}`);
  }

  return (data ?? []) as PublicEventSession[];
}

export async function getPublicTelemetry(
  token: string,
  sessionId: string,
  startTs: Date,
  endTs: Date,
  maxPoints: number = 20000
): Promise<TrackPoint[]> {
  const { data, error } = await supabase.rpc('public_get_telemetry_window', {
    p_token: token,
    p_session_id: sessionId,
    p_start_ts: startTs.toISOString(),
    p_end_ts: endTs.toISOString(),
    p_max_points: maxPoints,
  });

  if (error) {
    throw new Error(`Failed to load public telemetry: ${error.message}`);
  }

  if (!data) {
    return [];
  }

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

    if (row.meta) {
      const meta = row.meta as Record<string, unknown>;
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

