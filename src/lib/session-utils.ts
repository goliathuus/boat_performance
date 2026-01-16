import { supabase } from './supabase';

/**
 * Determine the end time (tMax) for a session based on business logic:
 * 1. If session has ended_at, use it
 * 2. If session has event_id and event has ended_at, use event.ended_at
 * 3. Otherwise, query the last telemetry point
 */
export async function determineSessionEndTime(
  sessionId: string,
  startedAt: string,
  endedAt: string | null,
  eventId: string | null
): Promise<number> {
  const tMin = new Date(startedAt).getTime();
  
  // 1. If session has ended_at, use it
  if (endedAt) {
    return new Date(endedAt).getTime();
  }
  
  // 2. If session has event_id, try to get event.ended_at
  if (eventId) {
    const { data: event } = await supabase
      .from('events')
      .select('ended_at')
      .eq('id', eventId)
      .single();
    
    if (event?.ended_at) {
      console.log('[determineSessionEndTime] Using event ended_at for session', sessionId, event.ended_at);
      return new Date(event.ended_at).getTime();
    }
  }
  
  // 3. Query the last telemetry point
  const { data: lastPoint } = await supabase
    .from('telemetry')
    .select('ts')
    .eq('session_id', sessionId)
    .order('ts', { ascending: false })
    .limit(1)
    .single();
  
  if (lastPoint?.ts) {
    console.log('[determineSessionEndTime] Using last telemetry point for session', sessionId, lastPoint.ts);
    return new Date(lastPoint.ts).getTime();
  }
  
  // Fallback to tMin if no telemetry found
  return tMin;
}

