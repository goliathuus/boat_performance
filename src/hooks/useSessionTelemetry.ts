import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useReplayStore } from '@/state/useReplayStore';
import { getTelemetryAll } from '@/lib/supabase-rpc';

interface UseSessionTelemetryResult {
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to load telemetry for a single session
 * Loads all data once when session is selected
 * Allows access to all sessions (not just user's own sessions)
 */
export function useSessionTelemetry(sessionId: string | null): UseSessionTelemetryResult {
  const setSelectedSessions = useReplayStore((state) => state.setSelectedSessions);
  const selectedSessionId = useReplayStore((state) => state.selectedSessionId);
  const selectedEventId = useReplayStore((state) => state.selectedEventId);
  const updateMultipleSessionPoints = useReplayStore((state) => state.updateMultipleSessionPoints);
  const updateSessionTimeRange = useReplayStore((state) => state.updateSessionTimeRange);
  const addSessions = useReplayStore((state) => state.addSessions);
  const resetReplay = useReplayStore((state) => state.reset);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadedSessionsRef = useRef<Set<string>>(new Set());
  const previousSessionIdRef = useRef<string | null>(null);
  const storeSessions = useReplayStore((state) => state.sessions); // Subscribe to store sessions to verify they exist

  // Initialize session in store when session is selected
  useEffect(() => {
    // Only skip if we're in event mode AND no individual session is selected
    // If selectedSessionId is defined, we should load the individual session regardless of selectedEventId
    if (selectedEventId && !selectedSessionId) {
      return;
    }
    
    if (!sessionId || !selectedSessionId || selectedSessionId !== sessionId) {
      return;
    }

    // Reset store if session changed
    if (previousSessionIdRef.current !== null && previousSessionIdRef.current !== sessionId) {
      resetReplay();
      loadedSessionsRef.current.clear();
    }
    previousSessionIdRef.current = sessionId;

    // Check if we need to initialize session
    if (loadedSessionsRef.current.has(sessionId)) {
      return;
    }

    // Load session metadata
    const loadSessionMetadata = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: session, error: sessionError } = await supabase
          .from('sessions')
          .select(`
            id,
            name,
            started_at,
            ended_at,
            boat_id,
            boats(display_name)
          `)
          .eq('id', sessionId)
          .single();

        if (sessionError || !session) {
          console.error('Failed to load session metadata:', sessionError);
          return;
        }

        const tMin = new Date(session.started_at).getTime();
        // Use started_at as initial tMax instead of Date.now() - will be recalculated from points
        const tMax = session.ended_at
          ? new Date(session.ended_at).getTime()
          : tMin; // Use tMin as fallback instead of Date.now()

        const boatDisplayName = session.boats && Array.isArray(session.boats) && session.boats.length > 0
          ? session.boats[0].display_name
          : null;

        // Add session to store
        addSessions([{
          sessionId: session.id,
          name: session.name,
          tMin,
          tMax,
          boatDisplayName: boatDisplayName || undefined,
        }]);

        loadedSessionsRef.current.add(sessionId);

        // Set session as selected
        setSelectedSessions([sessionId]);
      } catch (err) {
        console.error('Error loading session metadata:', err);
      }
    };

    loadSessionMetadata();
  }, [sessionId, selectedSessionId, selectedEventId, addSessions, setSelectedSessions, resetReplay]);

  // Load telemetry data when session changes
  useEffect(() => {
    
    // Only skip if we're in event mode AND no individual session is selected
    // If selectedSessionId is defined, we should load the individual session regardless of selectedEventId
    if (selectedEventId && !selectedSessionId) {
      return;
    }
    
    if (!sessionId || !selectedSessionId || selectedSessionId !== sessionId) {
      return;
    }

    setLoading(true);
    setError(null);

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Verify session is in store before loading telemetry
    // The first useEffect should have added it, but we check to be safe
    if (!storeSessions.has(sessionId)) {
      console.warn('[useSessionTelemetry] Session not in store yet, skipping telemetry load', {
        sessionId,
        availableSessions: Array.from(storeSessions.keys()),
      });
      // Don't set loading to false here - wait for the session to be added
      // The effect will re-run when storeSessions changes
      return;
    }

    // Get session time range
    const loadTelemetry = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: session, error: sessionError } = await supabase
          .from('sessions')
          .select('started_at, ended_at')
          .eq('id', sessionId)
          .single();

        if (sessionError || !session) {
          throw new Error('Failed to load session metadata');
        }

        const sessionStartsAt = new Date(session.started_at);
        const sessionEndsAt = session.ended_at
          ? new Date(session.ended_at)
          : new Date();

        // Load telemetry for this session
        const points = await getTelemetryAll(sessionId, sessionStartsAt, sessionEndsAt);

        if (!abortControllerRef.current?.signal.aborted) {
          // Sort points by time before updating
          const sortedPoints = [...points].sort((a, b) => a.t - b.t);
          
          // Update session points
          updateMultipleSessionPoints([{ sessionId, points: sortedPoints }]);
          
          // Recalculate tMin/tMax based on actual points
          updateSessionTimeRange(sessionId);
          
          // Explicitly recalculate globalTMin/globalTMax from all selected sessions after points are loaded
          const store = useReplayStore.getState();
          const selectedSessionIds = store.selectedSessionIds;
          const sessions = store.sessions;
          
          let finalGlobalTMin = Infinity;
          let finalGlobalTMax = -Infinity;
          selectedSessionIds.forEach((id) => {
            const s = sessions.get(id);
            if (s && s.points.length > 0) {
              // Use the recalculated tMin/tMax from points
              finalGlobalTMin = Math.min(finalGlobalTMin, s.tMin);
              finalGlobalTMax = Math.max(finalGlobalTMax, s.tMax);
            }
          });
          
          if (finalGlobalTMin !== Infinity && finalGlobalTMax !== -Infinity) {
            useReplayStore.setState({
              globalTMin: finalGlobalTMin,
              globalTMax: finalGlobalTMax,
            });
          }
          
          setLoading(false);
        }
      } catch (err) {
        if (!abortControllerRef.current?.signal.aborted) {
          setError(err instanceof Error ? err : new Error('Failed to load telemetry data'));
          setLoading(false);
        }
      }
    };

    loadTelemetry();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [sessionId, selectedSessionId, selectedEventId, updateMultipleSessionPoints, updateSessionTimeRange, storeSessions]);

  return {
    loading,
    error,
  };
}

