import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface EventSession {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  boat_id: string | null;
  boat_display_name: string | null;
  user_id: string;
  event_id: string;
}

interface UseEventSessionsResult {
  sessions: EventSession[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to load sessions for a specific event
 * Includes boat display_name via JOIN with boats table
 */
export function useEventSessions(eventId: string | null): UseEventSessionsResult {
  const [sessions, setSessions] = useState<EventSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadSessions = async () => {
    if (!eventId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Try to load with JOIN to boats table
      const { data, error: queryError } = await supabase
        .from('sessions')
        .select(`
          id,
          name,
          started_at,
          ended_at,
          boat_id,
          user_id,
          event_id,
          boats(display_name)
        `)
        .eq('event_id', eventId)
        .order('started_at', { ascending: true });

      if (queryError) {
        throw new Error(`Failed to load sessions: ${queryError.message}`);
      }

      if (!data) {
        setSessions([]);
        setLoading(false);
        return;
      }

      // Format the data (boats is an array from the JOIN, take first element)
      const formattedSessions: EventSession[] = data.map((session: any) => ({
        id: session.id,
        name: session.name,
        started_at: session.started_at,
        ended_at: session.ended_at,
        boat_id: session.boat_id,
        boat_display_name: session.boats && Array.isArray(session.boats) && session.boats.length > 0
          ? session.boats[0].display_name
          : session.boats?.display_name || null,
        user_id: session.user_id,
        event_id: session.event_id,
      }));

      setSessions(formattedSessions);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load sessions'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [eventId]);

  return {
    sessions,
    loading,
    error,
    refetch: loadSessions,
  };
}






