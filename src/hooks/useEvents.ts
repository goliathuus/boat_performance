import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { EventWithStats } from '@/domain/types';

interface UseEventsResult {
  events: EventWithStats[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to load events for the current admin user
 * Uses RPC admin_get_events if available, falls back to direct query
 */
export function useEvents(): UseEventsResult {
  const [events, setEvents] = useState<EventWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Try RPC first (admin_get_events)
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_events');

        if (!rpcError && rpcData) {
          // RPC returns events with session_count
          const formattedEvents: EventWithStats[] = rpcData.map((event: any) => {
            const now = new Date();
            const startsAt = new Date(event.starts_at);
            const endsAt = new Date(event.ends_at);

            let status: 'active' | 'expired' | 'upcoming';
            if (now >= startsAt && now <= endsAt) {
              status = 'active';
            } else if (now > endsAt) {
              status = 'expired';
            } else {
              status = 'upcoming';
            }

            return {
              id: event.id,
              title: event.title,
              code: event.code,
              share_token: event.share_token,
              share_enabled: event.share_enabled ?? true,
              starts_at: event.starts_at,
              ends_at: event.ends_at,
              admin_user_id: event.admin_user_id,
              created_at: event.created_at,
              owner_name: event.owner_name ?? null,
              owner_email: event.owner_email ?? null,
              status,
              session_count: event.session_count || 0,
            };
          });

          setEvents(formattedEvents);
          setLoading(false);
          return;
        }
      } catch (rpcErr) {
        // RPC not available or failed, fall back to direct query
        console.log('RPC admin_get_events not available, using direct query');
      }

      // Fallback: Direct query (no filter - RLS policies will handle access control)
      const { data: directData, error: directError } = await supabase
        .from('events')
        .select('id, title, code, share_token, share_enabled, starts_at, ends_at, admin_user_id, created_at')
        .order('starts_at', { ascending: false });

      if (directError) {
        throw new Error(`Failed to load events: ${directError.message}`);
      }

      if (!directData) {
        setEvents([]);
        setLoading(false);
        return;
      }

      // Get session counts for each event
      const eventsWithStats: EventWithStats[] = await Promise.all(
        directData.map(async (event) => {
          const { count } = await supabase
            .from('sessions')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.id);

          const now = new Date();
          const startsAt = new Date(event.starts_at);
          const endsAt = new Date(event.ends_at);

          let status: 'active' | 'expired' | 'upcoming';
          if (now >= startsAt && now <= endsAt) {
            status = 'active';
          } else if (now > endsAt) {
            status = 'expired';
          } else {
            status = 'upcoming';
          }

          return {
            ...event,
            status,
            session_count: count || 0,
          };
        })
      );

      setEvents(eventsWithStats);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load events'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []); // Only load once on mount

  // Memoize events to prevent unnecessary re-renders
  const memoizedEvents = useMemo(() => events, [events]);

  return {
    events: memoizedEvents,
    loading,
    error,
    refetch: loadEvents,
  };
}

