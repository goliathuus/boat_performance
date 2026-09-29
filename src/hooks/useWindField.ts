import { useEffect, useMemo, useState } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import {
  WIND_MODELS,
  fetchModelRunInfo,
  fetchWindGrid,
  modelCovers,
  paddedBounds,
  type ModelRunInfo,
  type WindBounds,
  type WindGrid,
  type WindModelId,
} from '@/lib/wind';

export type WindStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

// Caches de module : revenir sur un replay deja vu ne refait pas la requete.
const gridCache = new Map<string, Promise<WindGrid>>();
const runInfoCache = new Map<WindModelId, { at: number; promise: Promise<ModelRunInfo> }>();

const DAY_MS = 86_400_000;
// Un replay proche du present (tracking live) relit les donnees a ce rythme
// pour recuperer les nouveaux runs ; l'archive, elle, ne change plus.
const LIVE_REFRESH_MS = 15 * 60_000;

function runInfo(model: WindModelId): Promise<ModelRunInfo> {
  const hit = runInfoCache.get(model);
  if (hit && Date.now() - hit.at < LIVE_REFRESH_MS) return hit.promise;
  const promise = fetchModelRunInfo(model);
  runInfoCache.set(model, { at: Date.now(), promise });
  promise.catch(() => runInfoCache.delete(model));
  return promise;
}

/**
 * Champ de vent couvrant les traces selectionnees, au jour de `currentTime`,
 * pour le modele choisi.
 *
 * On ne charge que la fenetre de deux jours qui contient la tete de lecture :
 * un replay qui melange des sessions de dates eloignees ne declenche pas de
 * requete sur des mois.
 *
 * `preferred` null = choix automatique : AROME si les traces sont dans sa
 * zone, ECMWF sinon. Un AROME demande hors zone retombe aussi sur ECMWF.
 */
export function useWindField(enabled: boolean, currentTime: number, preferred: WindModelId | null) {
  const sessions = useReplayStore((s) => s.sessions);
  const selectedSessionIds = useReplayStore((s) => s.selectedSessionIds);
  const hiddenSessionIds = useReplayStore((s) => s.hiddenSessionIds);

  const trackBounds = useMemo<WindBounds | null>(() => {
    let south = Infinity;
    let west = Infinity;
    let north = -Infinity;
    let east = -Infinity;
    for (const id of selectedSessionIds) {
      if (hiddenSessionIds.has(id)) continue;
      const session = sessions.get(id);
      if (!session) continue;
      for (const p of session.points) {
        if (p.lat < south) south = p.lat;
        if (p.lat > north) north = p.lat;
        if (p.lon < west) west = p.lon;
        if (p.lon > east) east = p.lon;
      }
    }
    if (!Number.isFinite(south)) return null;
    // Arrondi : une trace qui s'allonge de quelques metres ne relance pas de requete.
    const q = (x: number) => Math.round(x * 20) / 20;
    return { south: q(south), west: q(west), north: q(north), east: q(east) };
  }, [sessions, selectedSessionIds, hiddenSessionIds]);

  const bounds = useMemo(
    () =>
      trackBounds
        ? paddedBounds(trackBounds.south, trackBounds.west, trackBounds.north, trackBounds.east)
        : null,
    [trackBounds]
  );

  const aromeAvailable = trackBounds ? modelCovers(WIND_MODELS.arome, trackBounds) : false;
  const model: WindModelId = preferred === 'ecmwf' || !aromeAvailable ? 'ecmwf' : 'arome';

  // Tracking live : la tete de lecture est proche du present, les runs changent.
  const live = currentTime > Date.now() - DAY_MS;
  const [refreshTick, setRefreshTick] = useState(() => Math.floor(Date.now() / LIVE_REFRESH_MS));
  useEffect(() => {
    if (!enabled || !live) return;
    const id = window.setInterval(() => setRefreshTick(Math.floor(Date.now() / LIVE_REFRESH_MS)), 60_000);
    return () => window.clearInterval(id);
  }, [enabled, live]);

  const day = Math.floor(currentTime / DAY_MS) * DAY_MS;
  const key = bounds
    ? `${model}|${bounds.south.toFixed(3)},${bounds.west.toFixed(3)},${bounds.north.toFixed(3)},${bounds.east.toFixed(3)}|${day}${live ? `|${refreshTick}` : ''}`
    : null;

  const [state, setState] = useState<{ key: string | null; grid: WindGrid | null; status: WindStatus }>({
    key: null,
    grid: null,
    status: 'idle',
  });

  useEffect(() => {
    if (!enabled || !key || !bounds) return;
    let cancelled = false;
    let promise = gridCache.get(key);
    if (!promise) {
      promise = fetchWindGrid(bounds, day, model);
      gridCache.set(key, promise);
      // Un echec ne doit pas rester en cache : on retentera au prochain passage.
      promise.catch(() => gridCache.delete(key));
    }
    // Pendant un changement de modele, on n'affiche pas l'ancien champ sous le nouveau nom.
    setState((prev) =>
      prev.key === key ? prev : { key, grid: prev.grid?.model === model ? prev.grid : null, status: 'loading' }
    );
    promise.then(
      (grid) => {
        if (cancelled) return;
        const hasData = grid.u.some((layer) => layer.some((x) => !Number.isNaN(x)));
        setState({ key, grid: hasData ? grid : null, status: hasData ? 'ready' : 'unavailable' });
      },
      () => {
        if (!cancelled) setState({ key, grid: null, status: 'error' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, key, bounds, day, model]);

  const [run, setRun] = useState<{ model: WindModelId; info: ModelRunInfo } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    runInfo(model).then(
      (info) => !cancelled && setRun({ model, info }),
      () => !cancelled && setRun(null)
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, model, refreshTick]);

  if (!enabled) {
    return { grid: null, status: 'idle' as WindStatus, model, aromeAvailable, runInfo: null };
  }
  return {
    grid: state.grid,
    status: state.status,
    model,
    aromeAvailable,
    runInfo: run?.model === model ? run.info : null,
  };
}
