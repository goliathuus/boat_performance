import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useReplayStore } from '@/state/useReplayStore';
import { getTelemetryAll } from '@/lib/supabase-rpc';
import { determineSessionEndTime } from '@/lib/session-utils';
import type { TrackPoint } from '@/domain/types';

interface UseTelemetryResult {
  loading: boolean;
  error: Error | null;
}

/**
 * Unified hook to load telemetry for selected sessions
 * Automatically detects mode and loads data efficiently:
 * - Single session: loads directly
 * - Multiple sessions: loads in parallel
 * - Handles session metadata loading if needed
 */
export function useTelemetry(): UseTelemetryResult {
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const sessions = useReplayStore((state) => state.sessions);
  const updateMultipleSessionPoints = useReplayStore((state) => state.updateMultipleSessionPoints);
  const updateSessionTimeRange = useReplayStore((state) => state.updateSessionTimeRange);
  const addSessions = useReplayStore((state) => state.addSessions);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadedSessionsRef = useRef<Set<string>>(new Set());
  const telemetryLoadedRef = useRef<Set<string>>(new Set());

  // Track sessions size and keys to detect when sessions are added to store
  const sessionsSize = sessions.size;
  const sessionsKeys = Array.from(sessions.keys()).join(',');

  // Reset tracking when selected sessions change
  useEffect(() => {
    // Clear tracking for sessions that are no longer selected
    const currentSelected = new Set(selectedSessionIds);
    loadedSessionsRef.current.forEach((id) => {
      if (!currentSelected.has(id)) {
        loadedSessionsRef.current.delete(id);
        telemetryLoadedRef.current.delete(id);
      }
    });
  }, [selectedSessionIds]);

  // Main effect: Load session metadata and telemetry
  useEffect(() => {
    console.log('[useTelemetry] Effect triggered', {
      selectedSessionIds: selectedSessionIds.length,
      sessionsSize,
      sessionsKeys,
      selectedIds: selectedSessionIds,
      storeSessionIds: Array.from(sessions.keys()),
    });

    if (selectedSessionIds.length === 0) {
      console.log('[useTelemetry] No sessions selected, returning');
      setLoading(false);
      return;
    }

    // Step 1: Load session metadata for sessions not in store
    const sessionsToLoadMetadata = selectedSessionIds.filter(
      (id) => !sessions.has(id) && !loadedSessionsRef.current.has(id)
    );

    console.log('[useTelemetry] Sessions analysis', {
      selectedCount: selectedSessionIds.length,
      inStore: selectedSessionIds.filter(id => sessions.has(id)).length,
      needMetadata: sessionsToLoadMetadata.length,
      sessionsToLoadMetadata,
    });

    if (sessionsToLoadMetadata.length > 0) {
      console.log('[useTelemetry] Loading metadata for sessions', sessionsToLoadMetadata);
      
      const loadMetadata = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.warn('[useTelemetry] No user found');
            return;
          }

          console.log('[useTelemetry] Fetching session metadata from DB');
          // Load sessions with their events if they have event_id
          const { data: sessionsData, error: sessionsError } = await supabase
            .from('sessions')
            .select(`
              id,
              name,
              started_at,
              ended_at,
              boat_id,
              event_id,
              boats(display_name),
              events(ended_at)
            `)
            .in('id', sessionsToLoadMetadata);

          if (sessionsError || !sessionsData) {
            console.error('[useTelemetry] Failed to load session metadata:', sessionsError);
            return;
          }

          console.log('[useTelemetry] Metadata loaded', {
            count: sessionsData.length,
            sessions: sessionsData.map(s => ({ id: s.id, name: s.name })),
          });

          // Process sessions and determine ended_at
          const sessionsToAdd = await Promise.all(
            sessionsData.map(async (session: any) => {
              const tMin = new Date(session.started_at).getTime();
              const tMax = await determineSessionEndTime(
                session.id,
                session.started_at,
                session.ended_at,
                session.event_id
              );

              const boatDisplayName = session.boats && Array.isArray(session.boats) && session.boats.length > 0
                ? session.boats[0].display_name
                : session.boats?.display_name || null;

              loadedSessionsRef.current.add(session.id);

              return {
                sessionId: session.id,
                name: session.name,
                tMin,
                tMax,
                boatDisplayName: boatDisplayName || undefined,
              };
            })
          );

          console.log('[useTelemetry] Adding sessions to store', sessionsToAdd.length);
          addSessions(sessionsToAdd);
          console.log('[useTelemetry] Sessions added to store');
        } catch (err) {
          console.error('[useTelemetry] Error loading session metadata:', err);
        }
      };

      loadMetadata();
      // Return early - will re-trigger when sessions are added to store
      return;
    }

    // Step 2: Load telemetry for sessions that need it
    const sessionsToLoadTelemetry = selectedSessionIds.filter(
      (id) => sessions.has(id) && !telemetryLoadedRef.current.has(id)
    );

    console.log('[useTelemetry] Telemetry analysis', {
      selectedCount: selectedSessionIds.length,
      inStore: selectedSessionIds.filter(id => sessions.has(id)).length,
      needTelemetry: sessionsToLoadTelemetry.length,
      sessionsToLoadTelemetry,
      alreadyLoaded: Array.from(telemetryLoadedRef.current),
    });

    if (sessionsToLoadTelemetry.length === 0) {
      console.log('[useTelemetry] No telemetry to load - all sessions already loaded or not in store');
      return;
    }

    console.log('[useTelemetry] Starting telemetry load for', sessionsToLoadTelemetry.length, 'sessions');
    setLoading(true);
    setError(null);

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const loadTelemetry = async () => {
      try {
        console.log('[useTelemetry] Loading telemetry in parallel for', sessionsToLoadTelemetry);
        
        // Load telemetry for all sessions in parallel
        const results = await Promise.allSettled(
          sessionsToLoadTelemetry.map(async (sessionId) => {
            const session = sessions.get(sessionId);
            if (!session) {
              throw new Error(`Session ${sessionId} not found in store`);
            }

            console.log('[useTelemetry] Loading telemetry for session', sessionId, {
              tMin: session.tMin,
              tMax: session.tMax,
              name: session.name,
            });

            // Use the tMin/tMax from store (which should now be correctly calculated)
            const sessionStartsAt = new Date(session.tMin);
            const sessionEndsAt = session.tMax > session.tMin
              ? new Date(session.tMax)
              : new Date(session.tMin + 3600000); // Fallback: 1 hour if still no end time

            const points = await getTelemetryAll(sessionId, sessionStartsAt, sessionEndsAt);

            console.log('[useTelemetry] Telemetry loaded for session', sessionId, {
              pointsCount: points.length,
            });

            if (abortControllerRef.current?.signal.aborted) {
              throw new Error('Request aborted');
            }

            return { sessionId, points };
          })
        );

        if (abortControllerRef.current?.signal.aborted) {
          console.warn('[useTelemetry] Results were aborted before processing');
          return;
        }

        // Process results
        const successful: Array<{ sessionId: string; points: TrackPoint[] }> = [];
        const failed: string[] = [];

        results.forEach((result, index) => {
          const sessionId = sessionsToLoadTelemetry[index];
          if (result.status === 'fulfilled') {
            telemetryLoadedRef.current.add(sessionId);
            if (result.value.points.length > 0) {
              successful.push(result.value);
            } else {
              console.warn('[useTelemetry] Session', sessionId, 'has no telemetry points');
            }
          } else {
            console.error(`[useTelemetry] Failed to load telemetry for session ${sessionId}:`, result.reason);
            telemetryLoadedRef.current.add(sessionId); // Mark as attempted
            failed.push(sessionId);
          }
        });

        console.log('[useTelemetry] Telemetry load results', {
          successful: successful.length,
          failed: failed.length,
          total: results.length,
        });

        // Update store with successful loads
        if (successful.length > 0) {
          console.log('[useTelemetry] Updating store with', successful.length, 'sessions');
          
          // Sort points by time before updating
          const sortedSuccessful = successful.map(({ sessionId, points }) => ({
            sessionId,
            points: [...points].sort((a, b) => a.t - b.t),
          }));

          updateMultipleSessionPoints(sortedSuccessful);

          // Recalculate tMin/tMax for each session based on actual points
          sortedSuccessful.forEach(({ sessionId }) => {
            updateSessionTimeRange(sessionId);
          });

          // Recalculate globalTMin/globalTMax from all selected sessions
          const store = useReplayStore.getState();
          const selectedIds = store.selectedSessionIds;
          const storeSessions = store.sessions;

          let finalGlobalTMin = Infinity;
          let finalGlobalTMax = -Infinity;
          selectedIds.forEach((id) => {
            const s = storeSessions.get(id);
            if (s && s.points.length > 0) {
              finalGlobalTMin = Math.min(finalGlobalTMin, s.tMin);
              finalGlobalTMax = Math.max(finalGlobalTMax, s.tMax);
            }
          });

          console.log('[useTelemetry] Global time range updated', {
            globalTMin: finalGlobalTMin === Infinity ? null : finalGlobalTMin,
            globalTMax: finalGlobalTMax === -Infinity ? null : finalGlobalTMax,
          });

          if (finalGlobalTMin !== Infinity && finalGlobalTMax !== -Infinity) {
            useReplayStore.setState({
              globalTMin: finalGlobalTMin,
              globalTMax: finalGlobalTMax,
            });
          }
        } else if (failed.length > 0) {
          console.warn('[useTelemetry] All telemetry loads failed', {
            failed: failed.length,
            total: results.length,
          });
        }

        setLoading(false);
        console.log('[useTelemetry] Telemetry loading complete');
      } catch (err) {
        if (!abortControllerRef.current?.signal.aborted) {
          console.error('[useTelemetry] Unexpected error:', err);
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
  }, [selectedSessionIds, sessionsSize, sessionsKeys, addSessions, updateMultipleSessionPoints, updateSessionTimeRange]);

  return {
    loading,
    error,
  };
}

