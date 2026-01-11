import Papa from 'papaparse';
import type { TrackPoint } from '@/domain/types';
import type { SessionData } from '@/state/useReplayStore';
import { supabase } from './supabase';

/**
 * Convert a TrackPoint to CSV row format
 */
function trackPointToCSVRow(
  point: TrackPoint,
  boatId: string,
  boatName: string
): Record<string, string | number> {
  const row: Record<string, string | number> = {
    time: point.t,
    boat_id: boatId,
    boat_name: boatName,
    lon: point.lon,
    lat: point.lat,
  };

  // Add optional fields only if they exist
  if (point.sog !== undefined && point.sog !== null) {
    row.speed = point.sog;
  }
  if (point.cog !== undefined && point.cog !== null) {
    row.cog = point.cog;
  }
  if (point.twd !== undefined && point.twd !== null) {
    row.twd = point.twd;
  }
  if (point.awa !== undefined && point.awa !== null) {
    row.awa = point.awa;
  }
  if (point.twa !== undefined && point.twa !== null) {
    row.twa = point.twa;
  }

  return row;
}

/**
 * Export a single session to CSV format
 */
export function exportSessionToCSV(sessionId: string, sessionData: SessionData): string {
  if (sessionData.points.length === 0) {
    throw new Error('Session has no data points to export');
  }

  const boatId = sessionId;
  const boatName = sessionData.boatDisplayName || sessionData.name || boatId;

  // Convert all points to CSV rows
  const rows = sessionData.points.map((point) =>
    trackPointToCSVRow(point, boatId, boatName)
  );

  // Generate CSV with PapaParse
  return Papa.unparse(rows, {
    header: true,
    columns: ['time', 'boat_id', 'boat_name', 'lon', 'lat', 'speed', 'cog', 'twd', 'awa', 'twa'],
  });
}

/**
 * Export multiple sessions to a single CSV file
 */
export function exportSessionsToCSV(
  sessionIds: string[],
  sessions: Map<string, SessionData>
): string {
  if (sessionIds.length === 0) {
    throw new Error('No sessions selected for export');
  }

  const allRows: Record<string, string | number>[] = [];

  for (const sessionId of sessionIds) {
    const sessionData = sessions.get(sessionId);
    if (!sessionData) {
      console.warn(`Session ${sessionId} not found in store, skipping`);
      continue;
    }

    if (sessionData.points.length === 0) {
      console.warn(`Session ${sessionId} has no data points, skipping`);
      continue;
    }

    const boatId = sessionId;
    const boatName = sessionData.boatDisplayName || sessionData.name || boatId;

    // Convert all points to CSV rows
    const rows = sessionData.points.map((point) =>
      trackPointToCSVRow(point, boatId, boatName)
    );

    allRows.push(...rows);
  }

  if (allRows.length === 0) {
    throw new Error('No data points found in selected sessions');
  }

  // Sort by time (ascending)
  allRows.sort((a, b) => {
    const timeA = typeof a.time === 'number' ? a.time : Number.parseFloat(String(a.time));
    const timeB = typeof b.time === 'number' ? b.time : Number.parseFloat(String(b.time));
    return timeA - timeB;
  });

  // Generate CSV with PapaParse
  return Papa.unparse(allRows, {
    header: true,
    columns: ['time', 'boat_id', 'boat_name', 'lon', 'lat', 'speed', 'cog', 'twd', 'awa', 'twa'],
  });
}

/**
 * Export session data directly from Supabase
 */
export async function exportSessionFromSupabase(sessionId: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Get session metadata
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, name, started_at, ended_at')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error(`Failed to load session: ${sessionError?.message || 'Session not found'}`);
  }

  // Get telemetry data
  const sessionStartsAt = new Date(session.started_at);
  const sessionEndsAt = session.ended_at ? new Date(session.ended_at) : new Date();

  // Load all telemetry points (using a large limit or pagination)
  const { data: telemetry, error: telemetryError } = await supabase
    .from('telemetry')
    .select('ts, lat, lon, speed, heading, meta')
    .eq('session_id', sessionId)
    .gte('ts', sessionStartsAt.toISOString())
    .lte('ts', sessionEndsAt.toISOString())
    .order('ts', { ascending: true });

  if (telemetryError) {
    throw new Error(`Failed to load telemetry: ${telemetryError.message}`);
  }

  if (!telemetry || telemetry.length === 0) {
    throw new Error('No telemetry data found for this session');
  }

  // Get boat name from meta or use session name
  const firstMeta = telemetry[0]?.meta as Record<string, unknown> | null;
  const boatId = (firstMeta?.boat_id as string) || (firstMeta?.boat_name as string) || sessionId;
  const boatName = (firstMeta?.boat_name as string) || session.name || boatId;

  // Convert telemetry to CSV rows
  const rows: Record<string, string | number>[] = telemetry.map((row) => {
    const t = new Date(row.ts).getTime();
    const meta = (row.meta as Record<string, unknown> | null) || {};

    const csvRow: Record<string, string | number> = {
      time: t,
      boat_id: boatId,
      boat_name: boatName,
      lon: row.lon,
      lat: row.lat,
    };

    // Add speed (prefer meta.sog, fallback to speed column)
    const sog = (meta.sog as number) ?? row.speed;
    if (sog !== null && sog !== undefined) {
      csvRow.speed = sog;
    }

    // Add course (prefer meta.cog, fallback to heading column)
    const cog = (meta.cog as number) ?? row.heading;
    if (cog !== null && cog !== undefined) {
      csvRow.cog = cog;
    }

    // Add wind data from meta
    if (meta.twd !== null && meta.twd !== undefined) {
      let twd = Number(meta.twd);
      if (twd < 0) twd += 360;
      if (twd >= 360) twd -= 360;
      csvRow.twd = twd;
    }

    if (meta.awa !== null && meta.awa !== undefined) {
      let awa = Number(meta.awa);
      if (awa < 0) awa += 360;
      if (awa >= 360) awa -= 360;
      csvRow.awa = awa;
    }

    if (meta.twa !== null && meta.twa !== undefined) {
      let twa = Number(meta.twa);
      if (twa < 0) twa += 360;
      if (twa >= 360) twa -= 360;
      csvRow.twa = twa;
    }

    return csvRow;
  });

  // Generate CSV with PapaParse
  return Papa.unparse(rows, {
    header: true,
    columns: ['time', 'boat_id', 'boat_name', 'lon', 'lat', 'speed', 'cog', 'twd', 'awa', 'twa'],
  });
}

/**
 * Export all sessions of an event to a single CSV file
 */
export async function exportEventToCSV(eventId: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Get event metadata
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, code, starts_at, ends_at')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    throw new Error(`Failed to load event: ${eventError?.message || 'Event not found'}`);
  }

  // Get all sessions for this event
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, name, started_at, ended_at, boat_id')
    .eq('event_id', eventId)
    .order('started_at', { ascending: true });

  if (sessionsError) {
    throw new Error(`Failed to load sessions: ${sessionsError.message}`);
  }

  if (!sessions || sessions.length === 0) {
    throw new Error('No sessions found for this event');
  }

  // Get boat names for sessions
  const boatIds = sessions
    .map((s) => s.boat_id)
    .filter((id): id is string => id !== null && id !== '');
  
  const boatNamesMap = new Map<string, string>();
  if (boatIds.length > 0) {
    const { data: boats } = await supabase
      .from('boats')
      .select('id, display_name')
      .in('id', boatIds);

    if (boats) {
      boats.forEach((boat) => {
        boatNamesMap.set(boat.id, boat.display_name || boat.id);
      });
    }
  }

  // Collect all telemetry rows from all sessions
  const allRows: Record<string, string | number>[] = [];

  for (const session of sessions) {
    const sessionStartsAt = new Date(session.started_at);
    const sessionEndsAt = session.ended_at ? new Date(session.ended_at) : new Date();

    // Load telemetry for this session
    const { data: telemetry, error: telemetryError } = await supabase
      .from('telemetry')
      .select('ts, lat, lon, speed, heading, meta')
      .eq('session_id', session.id)
      .gte('ts', sessionStartsAt.toISOString())
      .lte('ts', sessionEndsAt.toISOString())
      .order('ts', { ascending: true });

    if (telemetryError) {
      console.warn(`Failed to load telemetry for session ${session.id}: ${telemetryError.message}`);
      continue;
    }

    if (!telemetry || telemetry.length === 0) {
      console.warn(`No telemetry data found for session ${session.id}`);
      continue;
    }

    // Get boat name
    const boatId = session.boat_id || session.id;
    const boatName = session.boat_id
      ? boatNamesMap.get(session.boat_id) || session.name || boatId
      : session.name || boatId;

    // Convert telemetry to CSV rows
    const rows = telemetry.map((row) => {
      const t = new Date(row.ts).getTime();
      const meta = (row.meta as Record<string, unknown> | null) || {};

      const csvRow: Record<string, string | number> = {
        time: t,
        boat_id: boatId,
        boat_name: boatName,
        lon: row.lon,
        lat: row.lat,
      };

      // Add speed (prefer meta.sog, fallback to speed column)
      const sog = (meta.sog as number) ?? row.speed;
      if (sog !== null && sog !== undefined) {
        csvRow.speed = sog;
      }

      // Add course (prefer meta.cog, fallback to heading column)
      const cog = (meta.cog as number) ?? row.heading;
      if (cog !== null && cog !== undefined) {
        csvRow.cog = cog;
      }

      // Add wind data from meta
      if (meta.twd !== null && meta.twd !== undefined) {
        let twd = Number(meta.twd);
        if (twd < 0) twd += 360;
        if (twd >= 360) twd -= 360;
        csvRow.twd = twd;
      }

      if (meta.awa !== null && meta.awa !== undefined) {
        let awa = Number(meta.awa);
        if (awa < 0) awa += 360;
        if (awa >= 360) awa -= 360;
        csvRow.awa = awa;
      }

      if (meta.twa !== null && meta.twa !== undefined) {
        let twa = Number(meta.twa);
        if (twa < 0) twa += 360;
        if (twa >= 360) twa -= 360;
        csvRow.twa = twa;
      }

      return csvRow;
    });

    allRows.push(...rows);
  }

  if (allRows.length === 0) {
    throw new Error('No telemetry data found for any session in this event');
  }

  // Sort all rows by time (ascending)
  allRows.sort((a, b) => {
    const timeA = typeof a.time === 'number' ? a.time : Number.parseFloat(String(a.time));
    const timeB = typeof b.time === 'number' ? b.time : Number.parseFloat(String(b.time));
    return timeA - timeB;
  });

  // Generate CSV with PapaParse
  return Papa.unparse(allRows, {
    header: true,
    columns: ['time', 'boat_id', 'boat_name', 'lon', 'lat', 'speed', 'cog', 'twd', 'awa', 'twa'],
  });
}

