import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
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
import { Button } from '@/components/ui/button';
import { usePublicEvent } from '@/hooks/usePublicEvent';
import { usePublicTelemetry } from '@/hooks/usePublicTelemetry';
import type { Crossing, Gate, Result } from '@/types';

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
  const speed = useReplayStore((state) => state.speed);
  const setWindowStartTime = useReplayStore((state) => state.setWindowStartTime);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [openWidgets, setOpenWidgets] = useState<Set<string>>(new Set());
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

  const clock = useReplayClock(
    globalTMin ?? 0,
    globalTMin ?? 0,
    globalTMax ?? (globalTMin ?? 0),
    speed
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
      <div className="w-screen app-shell flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" text="Loading public event..." />
      </div>
    );
  }

  if (eventError || !event) {
    return (
      <div className="w-screen app-shell flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-xl font-semibold mb-2">Public link unavailable</div>
          <div className="text-sm text-muted-foreground">
            {eventError?.message || 'This link is invalid or disabled.'}
          </div>
        </div>
      </div>
    );
  }

  if (telemetryError) {
    return (
      <div className="w-screen app-shell flex items-center justify-center bg-background">
        <div className="text-sm text-destructive">{telemetryError.message}</div>
      </div>
    );
  }

  const selectedCount = selectedSessionIds.length;
  const hasAnyTelemetryPoints = selectedSessionIds.some(
    (id) => (sessions.get(id)?.points.length ?? 0) > 0
  );

  if (!loadingTelemetry && selectedCount === 0) {
    return (
      <div className="w-screen app-shell flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-xl font-semibold mb-2">No public sessions yet</div>
          <div className="text-sm text-muted-foreground">
            This event has no published sessions at the moment.
          </div>
        </div>
      </div>
    );
  }

  if (!loadingTelemetry && selectedCount > 0 && !hasAnyTelemetryPoints) {
    return (
      <div className="w-screen app-shell flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-xl font-semibold mb-2">No telemetry available</div>
          <div className="text-sm text-muted-foreground">
            Sessions exist, but no telemetry points were found for this public view.
          </div>
        </div>
      </div>
    );
  }

  if (loadingTelemetry || globalTMin === null || globalTMax === null) {
    return (
      <div className="w-screen app-shell flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" text="Loading telemetry..." />
      </div>
    );
  }

  return (
    <div className="w-screen app-shell overflow-hidden flex flex-col">
      <div className="absolute top-2 left-12 right-[4.75rem] sm:top-4 sm:left-16 sm:right-auto sm:max-w-[calc(100%-4rem-14rem)] z-[1000] flex flex-wrap items-center gap-2 sm:gap-3 bg-background/90 backdrop-blur-sm border rounded-md px-2.5 py-1.5 sm:px-3 sm:py-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{event.title}</div>
          <div className="text-xs text-muted-foreground truncate">
            {event.starts_at ? new Date(event.starts_at).toLocaleString() : 'N/A'} - {event.ends_at ? new Date(event.ends_at).toLocaleString() : 'N/A'}
          </div>
        </div>
        <div className="flex gap-1 rounded-md border bg-background p-0.5">
          <Button
            type="button"
            variant={replayViewMode === '2d' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 px-3"
            onClick={() => setReplayViewMode('2d')}
          >
            <span className="sm:hidden">2D</span><span className="hidden sm:inline">Vue 2D</span>
          </Button>
          <Button
            type="button"
            variant={replayViewMode === '3d' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 px-3"
            onClick={() => setReplayViewMode('3d')}
          >
            <span className="sm:hidden">3D</span><span className="hidden sm:inline">Vue 3D</span>
          </Button>
        </div>
        <FullscreenButton />
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

      <ReplayControls currentTime={clock.currentTime} setCurrentTime={clock.setCurrentTime} />
    </div>
  );
}

