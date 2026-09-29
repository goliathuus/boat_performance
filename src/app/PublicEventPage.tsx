import { useCallback, useEffect, useRef, useState, lazy, Suspense, type ReactNode } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import { useReplayClock } from '@/hooks/useReplayClock';
import { ReplayMapWithData } from '@/components/replay/ReplayMap';
import { BoatListPanel } from '@/components/replay/BoatListPanel';
import { BoatListWidget } from '@/components/replay/BoatListWidget';
import { GateRankingWidget } from '@/components/replay/GateRankingWidget';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { ToolsPanel } from '@/components/replay/ToolsPanel';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FullscreenButton } from '@/components/replay/FullscreenButton';
import { WindBackdrop } from '@/components/ui/WindBackdrop';
import { BrandMark, BrandWordmark } from '@/components/ui/brand';
import { formatDateRange } from '@/lib/time';
import { cn } from '@/lib/utils';
import { usePublicEvent } from '@/hooks/usePublicEvent';
import { usePublicTelemetry } from '@/hooks/usePublicTelemetry';
import { usePublicLiveTelemetry } from '@/hooks/usePublicLiveTelemetry';
import type { PublicEventMeta } from '@/lib/supabase-public';
import type { Crossing, Gate, Result } from '@/types';

// Marge autour des bornes de l'evenement : les bateaux partent souvent avant
// l'heure officielle, et les telephones vident leur file apres la fin.
const LIVE_MARGIN_MS = 60 * 60 * 1000;

function isEventLive(event: PublicEventMeta): boolean {
  const now = Date.now();
  if (event.starts_at && now < new Date(event.starts_at).getTime() - LIVE_MARGIN_MS) return false;
  if (event.ends_at && now > new Date(event.ends_at).getTime() + LIVE_MARGIN_MS) return false;
  return true;
}

// La vue 3D tire three.js, drei et un modele GLB de ~21 Mo : chargee a la demande
// pour ne pas peser sur le premier rendu de la carte.
const Replay3DView = lazy(() =>
  import('@/views/Replay3DView').then((m) => ({ default: m.Replay3DView }))
);

interface PublicEventPageProps {
  token: string;
}

export function PublicEventPage({ token }: PublicEventPageProps) {
  const { event, sessions: publicSessions, loading: loadingEvent, error: eventError } = usePublicEvent(token);
  const resetReplay = useReplayStore((state) => state.reset);
  const addSessions = useReplayStore((state) => state.addSessions);
  const setSelectedSessions = useReplayStore((state) => state.setSelectedSessions);
  const sessions = useReplayStore((state) => state.sessions);
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const globalTMin = useReplayStore((state) => state.globalTMin);
  const globalTMax = useReplayStore((state) => state.globalTMax);
  const setWindowStartTime = useReplayStore((state) => state.setWindowStartTime);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [openWidgets, setOpenWidgets] = useState<Set<string>>(() => new Set(['wind']));
  const toggleWind = useCallback(() => {
    setOpenWidgets((prev) => {
      const next = new Set(prev);
      if (next.has('wind')) next.delete('wind');
      else next.add('wind');
      return next;
    });
  }, []);
  const [replayViewMode, setReplayViewMode] = useState<'2d' | '3d'>('2d');
  const [gateStart, setGateStart] = useState<Gate | null>(null);
  const [gateFinish, setGateFinish] = useState<Gate | null>(null);
  const [gateDrawMode, setGateDrawMode] = useState<'none' | 'drawStart' | 'drawFinish'>('none');
  const [gateStartPartial, setGateStartPartial] = useState<{ lat: number; lon: number } | null>(null);
  const [gateFinishPartial, setGateFinishPartial] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedBoatId, setSelectedBoatId] = useState<string | null>(null);
  const [rankings, setRankings] = useState<Result[]>([]);
  const [crossingsByBoat, setCrossingsByBoat] = useState<Map<string, { start?: Crossing; finish?: Crossing }>>(new Map());
  const centerOnBoatRef = useRef<((sessionId: string, currentTime: number) => void) | null>(null);

  useEffect(() => {
    resetReplay();
    return () => resetReplay();
  }, [resetReplay, token]);

  useEffect(() => {
    if (!event || publicSessions.length === 0) return;

    const toAdd = publicSessions.map((session) => {
      const tMin = new Date(session.started_at).getTime();
      const fallbackEnd = session.ended_at
        ? new Date(session.ended_at).getTime()
        : (event.ends_at ? new Date(event.ends_at).getTime() : tMin + 60 * 60 * 1000);
      return {
        sessionId: session.id,
        name: session.name,
        tMin,
        tMax: Math.max(tMin, fallbackEnd),
        boatDisplayName: session.boat_display_name || undefined,
      };
    });

    addSessions(toAdd);
    setSelectedSessions(toAdd.map((s) => s.sessionId));
  }, [event, publicSessions, addSessions, setSelectedSessions]);

  const { loading: loadingTelemetry, error: telemetryError } = usePublicTelemetry(token);

  // Le direct est propose pendant l'evenement : les points arrivent encore.
  const eventLive = event !== null && isEventLive(event);
  const { lastUpdate: liveLastUpdate } = usePublicLiveTelemetry(
    token,
    eventLive,
    event !== null && !loadingTelemetry
  );
  // Suivre le direct : l'horloge colle au point le plus recent. Toucher a la
  // timeline en sort ; le bouton « Revenir au direct » y ramene.
  const [followLive, setFollowLive] = useState(true);
  const setLiveMode = useReplayStore((state) => state.setLiveMode);
  useEffect(() => {
    setLiveMode(eventLive);
  }, [eventLive, setLiveMode]);

  const clock = useReplayClock(
    globalTMin ?? 0,
    globalTMin ?? 0,
    globalTMax ?? (globalTMin ?? 0)
  );

  const following = eventLive && followLive;
  useEffect(() => {
    if (following && globalTMax !== null) {
      clock.setCurrentTime(globalTMax);
    }
    // clock.setCurrentTime est stable ; suivre globalTMax suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, globalTMax]);

  const handleUserSetCurrentTime = useCallback(
    (time: number) => {
      setFollowLive(false);
      clock.setCurrentTime(time);
    },
    [clock]
  );

  const clockInitializedRef = useRef(false);
  useEffect(() => {
    if (loadingTelemetry) {
      clockInitializedRef.current = false;
      return;
    }
    if (globalTMin !== null && globalTMax !== null && !clockInitializedRef.current) {
      clock.setCurrentTime(globalTMax);
      setWindowStartTime(globalTMin, globalTMax);
      clockInitializedRef.current = true;
    }
  }, [globalTMin, globalTMax, loadingTelemetry, clock, setWindowStartTime]);

  const handleMapReady = useCallback((centerOnBoat: (sessionId: string, currentTime: number) => void) => {
    centerOnBoatRef.current = centerOnBoat;
  }, []);

  if (loadingEvent) {
    return (
      <PublicStatus>
        <LoadingSpinner size="lg" text="Chargement de l’événement…" />
      </PublicStatus>
    );
  }

  if (eventError || !event) {
    return (
      <PublicStatus
        title="Lien public indisponible"
        text={eventError?.message || 'Ce lien est invalide ou a été désactivé par l’organisateur.'}
      />
    );
  }

  if (telemetryError) {
    return (
      <PublicStatus title="Impossible de charger les traces" text={telemetryError.message} />
    );
  }

  const selectedCount = selectedSessionIds.length;
  const hasAnyTelemetryPoints = selectedSessionIds.some(
    (id) => (sessions.get(id)?.points.length ?? 0) > 0
  );

  if (!loadingTelemetry && selectedCount === 0) {
    return (
      <PublicStatus
        title="Pas encore de session publiée"
        text="Les traces apparaîtront ici dès que des bateaux auront été ajoutés à l’événement."
      />
    );
  }

  if (!loadingTelemetry && selectedCount > 0 && !hasAnyTelemetryPoints) {
    return (
      eventLive ? (
        <PublicStatus
          title="En attente des premières positions"
          text="La carte s’affichera dès qu’un bateau aura envoyé sa position."
        />
      ) : (
        <PublicStatus
          title="Aucune position enregistrée"
          text="Les sessions existent, mais aucun point GPS n’a encore été reçu."
        />
      )
    );
  }

  if (loadingTelemetry || globalTMin === null || globalTMax === null) {
    return (
      <PublicStatus>
        <LoadingSpinner size="lg" text="Chargement des traces…" />
      </PublicStatus>
    );
  }

  return (
    <div className="dark bg-background text-foreground w-screen app-shell overflow-hidden flex flex-col">
      {/*
        En-tete public : meme grammaire que la barre du replay (pastilles
        vitrees sur une ligne). L'evenement remplace le bouton retour ; les
        dates disparaissent sur telephone pour laisser la carte respirer.
      */}
      <div className="absolute left-2 right-14 top-2 z-[1000] flex items-center gap-2 safe-top sm:left-16 sm:right-auto sm:top-3 sm:max-w-[calc(100%-4rem-15rem)]">
        <div className="glass flex h-10 min-w-0 items-center gap-2.5 rounded-full border py-1 pl-1.5 pr-4">
          <BrandMark className="h-7 w-7 rounded-full" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">{event.title}</div>
            {event.starts_at && (
              <div className="hidden truncate text-[11px] text-muted-foreground tabular-nums sm:block">
                {formatDateRange(event.starts_at, event.ends_at ?? null)}
              </div>
            )}
          </div>
        </div>
        {eventLive &&
          (following ? (
            <div
              className="glass flex h-10 flex-none items-center gap-1.5 rounded-full border border-red-400/40 px-3 text-xs font-semibold text-red-300"
              title={liveLastUpdate ? `Mis à jour à ${new Date(liveLastUpdate).toLocaleTimeString('fr-FR')}` : undefined}
            >
              <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" aria-hidden="true" />
              <span className="hidden sm:inline">En direct</span>
              <span className="sm:hidden">Live</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFollowLive(true)}
              className="glass flex h-10 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors hover:bg-accent/60"
            >
              <span className="h-2 w-2 rounded-full bg-red-400/60" aria-hidden="true" />
              <span className="hidden sm:inline">Revenir au direct</span>
              <span className="sm:hidden">Direct</span>
            </button>
          ))}
        <div className="glass flex h-10 flex-none items-center rounded-full border p-1" role="group" aria-label="Vue">
          {(['2d', '3d'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={replayViewMode === mode}
              onClick={() => setReplayViewMode(mode)}
              className={cn(
                'h-8 rounded-full px-3.5 text-sm font-semibold transition-colors',
                replayViewMode === mode ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:text-foreground'
              )}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        <FullscreenButton className="glass h-10 w-10 flex-none rounded-full" />
      </div>

      <div className="flex-1 relative">
        <ToolsPanel
          activeTool={activeTool}
          onToolChange={setActiveTool}
          openWidgets={openWidgets}
          onToggleWidget={(widgetId) => {
            setOpenWidgets((prev) => {
              const next = new Set(prev);
              if (widgetId === 'boatList' || widgetId === 'gateRanking') {
                next.delete('boatList');
                next.delete('gateRanking');
                if (!prev.has(widgetId)) {
                  next.add(widgetId);
                }
              } else if (next.has(widgetId)) {
                next.delete(widgetId);
              } else {
                next.add(widgetId);
              }
              return next;
            });
          }}
        />
        {replayViewMode === '2d' ? (
          <ReplayMapWithData
            currentTime={clock.currentTime}
            onMapReady={handleMapReady}
            activeTool={activeTool}
            isGateRankingOpen={openWidgets.has('gateRanking')}
            gateStart={gateStart}
            gateFinish={gateFinish}
            gateDrawMode={gateDrawMode}
            gateStartPartial={gateStartPartial}
            gateFinishPartial={gateFinishPartial}
            rankings={rankings}
            crossingsByBoat={crossingsByBoat}
            selectedBoatId={selectedBoatId}
            onSetGateStart={setGateStart}
            onSetGateFinish={setGateFinish}
            onSetGateDrawMode={setGateDrawMode}
            onSetGateStartPartial={setGateStartPartial}
            onSetGateFinishPartial={setGateFinishPartial}
            onSetRankings={setRankings}
            onSetCrossingsByBoat={setCrossingsByBoat}
            onSetSelectedBoatId={setSelectedBoatId}
            showWind={openWidgets.has('wind')}
            onToggleWind={toggleWind}
          />
        ) : (
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><LoadingSpinner /></div>}>
            <Replay3DView currentTime={clock.currentTime} />
          </Suspense>
        )}
        <BoatListWidget
          currentTime={clock.currentTime}
          onCenterBoat={(sessionId) => {
            if (centerOnBoatRef.current) {
              centerOnBoatRef.current(sessionId, clock.currentTime);
            }
          }}
        />
        {openWidgets.has('boatList') && (
          <div className="absolute inset-y-0 right-0 z-[1000] max-w-full">
            <BoatListPanel
              currentTime={clock.currentTime}
              onCenterBoat={(sessionId) => {
                if (centerOnBoatRef.current) {
                  centerOnBoatRef.current(sessionId, clock.currentTime);
                }
              }}
            />
          </div>
        )}
        {openWidgets.has('gateRanking') && (
          <div className="absolute inset-y-0 right-0 z-[1000] max-w-full">
            <GateRankingWidget
              gateStart={gateStart}
              gateFinish={gateFinish}
              gateDrawMode={gateDrawMode}
              gateStartPartial={gateStartPartial}
              gateFinishPartial={gateFinishPartial}
              rankings={rankings}
              crossingsByBoat={crossingsByBoat}
              selectedBoatId={selectedBoatId}
              onSetGateStart={setGateStart}
              onSetGateFinish={setGateFinish}
              onSetGateDrawMode={setGateDrawMode}
              onSetGateStartPartial={setGateStartPartial}
              onSetGateFinishPartial={setGateFinishPartial}
              onSetRankings={setRankings}
              onSetCrossingsByBoat={setCrossingsByBoat}
              onSetSelectedBoatId={setSelectedBoatId}
            />
          </div>
        )}
      </div>

      <ReplayControls currentTime={clock.currentTime} setCurrentTime={handleUserSetCurrentTime} />
    </div>
  );
}

/** Ecran d'attente ou d'erreur de la page publique, au style des pages hors carte. */
function PublicStatus({ title, text, children }: { title?: string; text?: string; children?: ReactNode }) {
  return (
    <div className="relative w-screen app-shell flex items-center justify-center px-5">
      <WindBackdrop />
      <div className="relative flex w-full max-w-md flex-col items-center gap-5 text-center">
        <BrandWordmark />
        {children}
        {title && (
          <div className="glass w-full rounded-2xl border p-6">
            <div className="text-lg font-semibold">{title}</div>
            {text && <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
