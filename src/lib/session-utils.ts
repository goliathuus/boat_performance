import { supabase } from './supabase';

/**
 * Determine the end time (tMax) for a session based on business logic:
 * 1. If session has ended_at, consider it
 * 2. If session has event_id and event has ended_at, consider it
 * 3. Always check the last telemetry point
 * 4. Use the maximum available end time (never earlier than tMin)
 */
export async function determineSessionEndTime(
  sessionId: string,
  startedAt: string,
  endedAt: string | null,
  eventId: string | null
): Promise<number> {
  const tMin = new Date(startedAt).getTime();

  const sessionEnd: number | null = endedAt ? new Date(endedAt).getTime() : null;
  let eventEnd: number | null = null;
  let telemetryEnd: number | null = null;

  // 1. If session has event_id, try to get event.ended_at
  if (eventId) {
    const { data: event } = await supabase
      .from('events')
      .select('ended_at')
      .eq('id', eventId)
      .single();
    
    if (event?.ended_at) {
      eventEnd = new Date(event.ended_at).getTime();
    }
  }
  
  // 2. Query the last telemetry point
  const { data: lastPoint } = await supabase
    .from('telemetry')
    .select('ts')
    .eq('session_id', sessionId)
    .order('ts', { ascending: false })
    .limit(1)
    .single();
  
  if (lastPoint?.ts) {
    telemetryEnd = new Date(lastPoint.ts).getTime();
  }
  
  const tMax = Math.max(
    tMin,
    sessionEnd ?? tMin,
    eventEnd ?? tMin,
    telemetryEnd ?? tMin
  );

  return tMax;
}

