import { useEffect, useRef, useState } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import { getPublicEventSessions, getPublicTelemetrySince } from '@/lib/supabase-public';
import type { TrackPoint } from '@/domain/types';

// Les telephones envoient environ un point par seconde : 5 s suffit a une
// carte fluide sans multiplier les requetes par spectateur.
const POLL_INTERVAL_MS = 5_000;
// Un bateau qui s'inscrit en cours d'evenement doit apparaitre sans recharger.
const SESSIONS_REFRESH_MS = 30_000;

interface UsePublicLiveTelemetryResult {
  /** Heure (horloge locale) de la derniere interrogation reussie. */
  lastUpdate: number | null;
  error: Error | null;
}

/**
 * Suivi en direct de la page publique : ajoute au store les points arrives
 * depuis la derniere interrogation, pour tous les bateaux de l'evenement.
 *
 * `enabled` : l'evenement est en cours. Le curseur est pris des ce moment,
 * avant la fin du chargement de l'historique, pour ne pas perdre les points
 * arrives pendant ce chargement. `historyLoaded` : l'interrogation periodique
 * ne demarre qu'ensuite, pour fusionner dans des sessions deja remplies.
 */
export function usePublicLiveTelemetry(
  token: string,
  enabled: boolean,
  historyLoaded: boolean
): UsePublicLiveTelemetryResult {
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const cursorRef = useRef<string | null>(null);
  const cursorReadyRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    cursorRef.current = null;
    cursorReadyRef.current = null;
  }, [token]);

  useEffect(() => {
    if (!enabled || cursorReadyRef.current) return;
    cursorReadyRef.current = getPublicTelemetrySince(token, null)
      .then((page) => {
        cursorRef.current = page.nextSince;
      })
      .catch(() => {
        // Sans curseur, la premiere interrogation repartira de maintenant.
      });
  }, [token, enabled]);

  useEffect(() => {
    if (!enabled || !historyLoaded) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let lastSessionsRefresh = Date.now();

    const refreshSessions = async () => {
      const publicSessions = await getPublicEventSessions(token);
      const store = useReplayStore.getState();
      const newSessions = publicSessions.filter((s) => !store.sessions.has(s.id));
      if (newSessions.length === 0) return;

      // Bornes provisoires : remplacees par celles des points des leur arrivee.
      store.addSessions(
        newSessions.map((s) => {
          const t = new Date(s.started_at).getTime();
          return {
            sessionId: s.id,
            name: s.name,
            tMin: t,
            tMax: t,
            boatDisplayName: s.boat_display_name || undefined,
          };
        })
      );
      const selected = useReplayStore.getState().selectedSessionIds;
      store.setSelectedSessions([...selected, ...newSessions.map((s) => s.id)]);
      store.recomputeGlobalRange();
    };

    const poll = async () => {
      try {
        await cursorReadyRef.current;
        if (cancelled) return;
        const bySession = new Map<string, TrackPoint[]>();
        let continuation = false;
        // Une reponse tronquee (gros rattrapage apres coupure) se lit par pages.
        do {
          const page = await getPublicTelemetrySince(token, cursorRef.current, continuation);
          if (cancelled) return;
          cursorRef.current = page.nextSince;
          page.points.forEach(({ sessionId, point }) => {
            const list = bySession.get(sessionId);
            if (list) list.push(point);
            else bySession.set(sessionId, [point]);
          });
          continuation = page.truncated;
        } while (continuation);

        const known = useReplayStore.getState().sessions;
        const hasUnknownSession = Array.from(bySession.keys()).some((id) => !known.has(id));
        if (hasUnknownSession || Date.now() - lastSessionsRefresh > SESSIONS_REFRESH_MS) {
          lastSessionsRefresh = Date.now();
          await refreshSessions();
          if (cancelled) return;
        }

        if (bySession.size > 0) {
          useReplayStore.getState().appendSessionPoints(
            Array.from(bySession, ([sessionId, points]) => ({ sessionId, points }))
          );
        }
        setLastUpdate(Date.now());
        setError(null);
      } catch (err) {
        // On garde le curseur : la prochaine interrogation reprend au meme endroit.
        setError(err instanceof Error ? err : new Error('Live update failed'));
      } finally {
        if (!cancelled) {
          pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [token, enabled, historyLoaded]);

  return { lastUpdate, error };
}
