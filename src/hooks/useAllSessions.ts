import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { EventSession } from './useEventSessions';

interface UseAllSessionsResult {
  sessions: EventSession[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to load all available sessions (for all users)
 * Includes boat display_name via JOIN with boats table
 * Returns ALL sessions (including those with ended_at, those with event_id, and from all users)
 */
export function useAllSessions(): UseAllSessionsResult {
  const [sessions, setSessions] = useState<EventSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSessions([]);
        setLoading(false);
        return;
      }

      // Load ALL sessions for ALL users (not just current user)
      // No filter on user_id, ended_at or event_id - show all available sessions
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
        .order('started_at', { ascending: false });

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
  }, []);

  return {
    sessions,
    loading,
    error,
    refetch: loadSessions,
  };
}

