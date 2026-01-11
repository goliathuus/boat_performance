import { useState, useEffect, useRef } from 'react';
import { useEventSessions } from './useEventSessions';
import { useReplayStore } from '@/state/useReplayStore';
import { getTelemetryAll } from '@/lib/supabase-rpc';
import type { TrackPoint } from '@/domain/types';

interface UseEventTelemetryResult {
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to load telemetry for all sessions of an event
 * Loads all data once when event is selected
 */
export function useEventTelemetry(eventId: string | null): UseEventTelemetryResult {
  const { sessions, loading: sessionsLoading } = useEventSessions(eventId);
  const setSelectedSessions = useReplayStore((state) => state.setSelectedSessions);
  const selectedEventId = useReplayStore((state) => state.selectedEventId);
  const updateMultipleSessionPoints = useReplayStore((state) => state.updateMultipleSessionPoints);
  const addSessions = useReplayStore((state) => state.addSessions);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadedSessionsRef = useRef<Set<string>>(new Set());
  const telemetryLoadedRef = useRef<Set<string>>(new Set()); // Track which sessions have telemetry loaded

  const selectedSessionId = useReplayStore((state) => state.selectedSessionId);

  // Reset tracking when event changes
  useEffect(() => {
    if (eventId && selectedEventId === eventId) {
      // Keep track of loaded sessions for current event
    } else {
      // Event changed or cleared - reset tracking
      loadedSessionsRef.current.clear();
      telemetryLoadedRef.current.clear();
    }
  }, [eventId, selectedEventId]);

  // Unified effect: Initialize sessions AND load telemetry in sequence
  useEffect(() => {
    // Don't run if we're in individual session mode
    if (selectedSessionId) return;
    if (!eventId || !selectedEventId || selectedEventId !== eventId) return;
    if (sessionsLoading) return;
    if (sessions.length === 0) return;

    // Step 1: Initialize sessions in store (if not already done)
    const newSessions = sessions.filter(
      (s) => !loadedSessionsRef.current.has(s.id)
    );

    if (newSessions.length > 0) {
      // Add all new sessions to store in batch
      const sessionsToAdd = newSessions.map((session) => {
        const tMin = new Date(session.started_at).getTime();
        const tMax = session.ended_at
          ? new Date(session.ended_at).getTime()
          : Date.now();
        
        loadedSessionsRef.current.add(session.id);
        
        return {
          sessionId: session.id,
          name: session.name,
          tMin,
          tMax,
          boatDisplayName: session.boat_display_name || undefined,
        };
      });
      
      addSessions(sessionsToAdd);
      
      // Set all session IDs as selected
      const allSessionIds = sessions.map((s) => s.id);
      setSelectedSessions(allSessionIds);
    }

    // Step 2: Load telemetry for sessions that haven't been loaded yet
    const sessionIds = sessions.map((s) => s.id);
    const sessionsToLoad = sessionIds.filter((id) => !telemetryLoadedRef.current.has(id));
    
    if (sessionsToLoad.length === 0) {
      // All sessions already have telemetry loaded
      return;
    }
    
    console.log('[useEventTelemetry] Loading telemetry for sessions', {
      totalSessions: sessionIds.length,
      sessionsToLoad: sessionsToLoad.length,
      sessionIds: sessionsToLoad.slice(0, 3),
    });

    setLoading(true);
    setError(null);

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Load telemetry for sessions that need it
    // Use Promise.allSettled to ensure all sessions are attempted even if some fail
    Promise.allSettled(
      sessionsToLoad.map(async (sessionId, index) => {
        const loadStart = Date.now();
        
        // Find session to get its specific dates
        const session = sessions.find(s => s.id === sessionId);
        if (!session) {
          throw new Error(`Session ${sessionId} not found in sessions array`);
        }

        // Use session-specific dates
        const sessionStartsAt = new Date(session.started_at);
        const sessionEndsAt = session.ended_at
          ? new Date(session.ended_at)
          : new Date();

        console.log(`[useEventTelemetry] Loading telemetry for session ${index + 1}/${sessionsToLoad.length}`, {
          sessionId,
          sessionStartsAt: sessionStartsAt.toISOString(),
          sessionEndsAt: sessionEndsAt.toISOString(),
        });

        const points = await getTelemetryAll(sessionId, sessionStartsAt, sessionEndsAt);
        const loadTime = Date.now() - loadStart;
        
        console.log(`[useEventTelemetry] Loaded telemetry for session ${index + 1}/${sessionsToLoad.length}`, {
          sessionId,
          pointsCount: points.length,
          loadTime: `${loadTime}ms`,
        });

        if (abortControllerRef.current?.signal.aborted) {
          throw new Error('Request aborted');
        }

        return { sessionId, points };
      })
    )
      .then((results) => {
        if (abortControllerRef.current?.signal.aborted) {
          console.warn('[useEventTelemetry] Results were aborted before processing');
          return;
        }

        // Process results: separate successful and failed
        const successful: Array<{ sessionId: string; points: TrackPoint[] }> = [];
        const failed: string[] = [];

        results.forEach((result, index) => {
          const sessionId = sessionsToLoad[index];
          if (result.status === 'fulfilled') {
            // Mark as loaded even if no points (session might not have telemetry)
            telemetryLoadedRef.current.add(sessionId);
            if (result.value.points.length > 0) {
              successful.push(result.value);
            }
          } else {
            console.error(`[useEventTelemetry] Failed to load telemetry for session ${sessionId}:`, result.reason);
            // Still mark as attempted to avoid infinite retries
            telemetryLoadedRef.current.add(sessionId);
            failed.push(sessionId);
          }
        });

        // Update store with successful loads
        if (successful.length > 0) {
          console.log('[useEventTelemetry] Updating store with telemetry', {
            successful: successful.length,
            failed: failed.length,
            total: results.length,
          });
          updateMultipleSessionPoints(successful);
        } else if (failed.length > 0) {
          console.warn('[useEventTelemetry] All telemetry loads failed', {
            failed: failed.length,
            total: results.length,
          });
        } else {
          console.log('[useEventTelemetry] All sessions processed (some may have no telemetry data)', {
            total: results.length,
          });
        }

        setLoading(false);
      })
      .catch((err) => {
        if (!abortControllerRef.current?.signal.aborted) {
          console.error('[useEventTelemetry] Unexpected error:', err);
          setError(err instanceof Error ? err : new Error('Failed to load telemetry data'));
          setLoading(false);
        }
      });

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [eventId, selectedEventId, selectedSessionId, sessions, sessionsLoading, addSessions, setSelectedSessions, updateMultipleSessionPoints]);

  return {
    loading,
    error,
  };
}
