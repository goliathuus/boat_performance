import { useEffect, useState } from 'react';
import {
  getPublicEventByToken,
  getPublicEventSessions,
  type PublicEventMeta,
  type PublicEventSession,
} from '@/lib/supabase-public';

interface UsePublicEventResult {
  event: PublicEventMeta | null;
  sessions: PublicEventSession[];
  loading: boolean;
  error: Error | null;
}

export function usePublicEvent(token: string): UsePublicEventResult {
  const [event, setEvent] = useState<PublicEventMeta | null>(null);
  const [sessions, setSessions] = useState<PublicEventSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [eventData, sessionsData] = await Promise.all([
          getPublicEventByToken(token),
          getPublicEventSessions(token),
        ]);

        setEvent(eventData);
        setSessions(sessionsData);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load public event'));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [token]);

  return { event, sessions, loading, error };
}

