import { useEffect, useRef, useState } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import { useReplayClock } from '@/hooks/useReplayClock';
import { ReplayMapWithData } from '@/components/replay/ReplayMap';
import { BoatListWidget } from '@/components/replay/BoatListWidget';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { usePublicEvent } from '@/hooks/usePublicEvent';
import { usePublicTelemetry } from '@/hooks/usePublicTelemetry';
import { exportSessionsToCSV } from '@/lib/csv-export';
import { downloadCSV, generateCSVFilename } from '@/lib/csv-download';
import type { Crossing, Gate, Result } from '@/types';

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
  const [isExporting, setIsExporting] = useState(false);
  const [gateStart, setGateStart] = useState<Gate | null>(null);
  const [gateFinish, setGateFinish] = useState<Gate | null>(null);
  const [gateDrawMode, setGateDrawMode] = useState<'none' | 'drawStart' | 'drawFinish'>('none');
  const [gateStartPartial, setGateStartPartial] = useState<{ lat: number; lon: number } | null>(null);
  const [gateFinishPartial, setGateFinishPartial] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedBoatId, setSelectedBoatId] = useState<string | null>(null);
  const [rankings, setRankings] = useState<Result[]>([]);
  const [crossingsByBoat, setCrossingsByBoat] = useState<Map<string, { start?: Crossing; finish?: Crossing }>>(new Map());

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

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const csv = exportSessionsToCSV(selectedSessionIds, sessions);
      const filename = generateCSVFilename(event?.title ?? 'public_event', selectedSessionIds.length > 1);
      downloadCSV(csv, filename);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  if (loadingEvent) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" text="Loading public event..." />
      </div>
    );
  }

  if (eventError || !event) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
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
      <div className="w-screen h-screen flex items-center justify-center bg-background">
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
      <div className="w-screen h-screen flex items-center justify-center bg-background">
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
      <div className="w-screen h-screen flex items-center justify-center bg-background">
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
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" text="Loading telemetry..." />
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col">
      <div className="absolute top-4 left-4 z-[1000] flex items-center gap-2 bg-background/90 border rounded-md px-3 py-2">
        <div>
          <div className="font-semibold">{event.title}</div>
          <div className="text-xs text-muted-foreground">
            {event.starts_at ? new Date(event.starts_at).toLocaleString() : 'N/A'} - {event.ends_at ? new Date(event.ends_at).toLocaleString() : 'N/A'}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isExporting || selectedSessionIds.length === 0}>
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      <div className="flex-1 relative">
        <ReplayMapWithData
          currentTime={clock.currentTime}
          activeTool={null}
          isGateRankingOpen={false}
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
        <BoatListWidget currentTime={clock.currentTime} />
      </div>

      <ReplayControls currentTime={clock.currentTime} setCurrentTime={clock.setCurrentTime} />
    </div>
  );
}

