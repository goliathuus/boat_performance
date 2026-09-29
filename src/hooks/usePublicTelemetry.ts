import { useEffect, useRef, useState } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import { getPublicTelemetry } from '@/lib/supabase-public';
import type { TrackPoint } from '@/domain/types';

interface UsePublicTelemetryResult {
  loading: boolean;
  error: Error | null;
}

export function usePublicTelemetry(token: string): UsePublicTelemetryResult {
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const sessions = useReplayStore((state) => state.sessions);
  const appendSessionPoints = useReplayStore((state) => state.appendSessionPoints);

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

    // Seul le premier chargement bloque la page : un bateau qui rejoint un
    // evenement en direct ne doit pas faire repasser la carte en chargement.
    if (loadedRef.current.size === 0) setLoading(true);
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

          updates.push({ sessionId, points });
          loadedRef.current.add(sessionId);
        }

        // Fusion plutot que remplacement : en direct, des points ont pu
        // arriver pendant ce chargement (tri, deduplication et recalcul des
        // bornes sont faits par le store).
        if (updates.length > 0) {
          appendSessionPoints(updates);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load public telemetry'));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [token, selectedSessionIds, sessions, appendSessionPoints]);

  return { loading, error };
}

