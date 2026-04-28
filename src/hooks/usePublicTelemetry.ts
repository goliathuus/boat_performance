import { useEffect, useRef, useState } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import { getPublicTelemetry } from '@/lib/supabase-public';
import { recomputeSOGAndCOG, dedupeConsecutivePositions } from '@/domain/tracks';
import type { TrackPoint } from '@/domain/types';

interface UsePublicTelemetryResult {
  loading: boolean;
  error: Error | null;
}

export function usePublicTelemetry(token: string): UsePublicTelemetryResult {
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const sessions = useReplayStore((state) => state.sessions);
  const updateMultipleSessionPoints = useReplayStore((state) => state.updateMultipleSessionPoints);
  const updateSessionTimeRange = useReplayStore((state) => state.updateSessionTimeRange);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const loadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadedRef.current = new Set();
  }, [token]);

  useEffect(() => {
    if (selectedSessionIds.length === 0) {
      setLoading(false);
      return;
    }

    const toLoad = selectedSessionIds.filter((id) => sessions.has(id) && !loadedRef.current.has(id));
    if (toLoad.length === 0) return;

    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        const updates: Array<{ sessionId: string; points: TrackPoint[] }> = [];

        for (const sessionId of toLoad) {
          const session = sessions.get(sessionId);
          if (!session) continue;

          const points = await getPublicTelemetry(
            token,
            sessionId,
            new Date(session.tMin),
            new Date(session.tMax),
            200000
          );

          const sorted = [...points].sort((a, b) => a.t - b.t);
          const deduped = dedupeConsecutivePositions(sorted);
          recomputeSOGAndCOG(deduped);
          updates.push({ sessionId, points: deduped });
          loadedRef.current.add(sessionId);
        }

        if (updates.length > 0) {
          updateMultipleSessionPoints(updates);
          updates.forEach((u) => updateSessionTimeRange(u.sessionId));

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

          if (finalGlobalTMin !== Infinity && finalGlobalTMax !== -Infinity) {
            useReplayStore.setState({
              globalTMin: finalGlobalTMin,
              globalTMax: finalGlobalTMax,
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load public telemetry'));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [token, selectedSessionIds, sessions, updateMultipleSessionPoints, updateSessionTimeRange]);

  return { loading, error };
}

