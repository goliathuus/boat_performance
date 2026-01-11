import { useEffect, useRef, useState } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import { useReplayClock } from '@/hooks/useReplayClock';
import { ReplayMapWithData } from '@/components/replay/ReplayMap';
import { BoatListPanel } from '@/components/replay/BoatListPanel';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { CsvImportButton } from '@/components/replay/CsvImportButton';
import { useEventTelemetry } from '@/hooks/useEventTelemetry';
import { useSessionTelemetry } from '@/hooks/useSessionTelemetry';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { exportSessionsToCSV } from '@/lib/csv-export';
import { downloadCSV, generateCSVFilename } from '@/lib/csv-download';

interface ReplayPageProps {
  onBack: () => void;
  onLogout?: () => void;
}

export function ReplayPage({ onBack, onLogout }: ReplayPageProps) {
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const selectedEventId = useReplayStore((state) => state.selectedEventId);
  const selectedSessionId = useReplayStore((state) => state.selectedSessionId);
  const sessions = useReplayStore((state) => state.sessions);
  const globalTMin = useReplayStore((state) => state.globalTMin);
  const globalTMax = useReplayStore((state) => state.globalTMax);
  const playing = useReplayStore((state) => state.playing);
  const speed = useReplayStore((state) => state.speed);
  const [isExporting, setIsExporting] = useState(false);
  
  // Track if clock has been initialized to avoid resetting user's cursor position
  const clockInitializedRef = useRef(false);

  // Load telemetry based on mode: event or individual session
  const { loading: eventLoading } = useEventTelemetry(selectedEventId);
  const { loading: sessionLoading } = useSessionTelemetry(selectedSessionId);

  // Initialize replay clock (only when times are available)
  // Note: globalTMax should never be null here due to spinner check above
  // But if it is, use globalTMin instead of Date.now() to avoid setting to current time
  const clock = useReplayClock(
    globalTMin ?? 0,
    globalTMin ?? 0,
    globalTMax ?? (globalTMin ?? 0),
    speed
  );

  // Initialize clock time only once when data is first loaded
  useEffect(() => {
    if (eventLoading || sessionLoading) {
      // Reset initialization flag when loading starts
      clockInitializedRef.current = false;
      return;
    }
    if (globalTMin !== null && globalTMax !== null && !clockInitializedRef.current) {
      clock.setCurrentTime(globalTMax);
      clockInitializedRef.current = true;
    }
  }, [globalTMin, globalTMax, clock, eventLoading, sessionLoading]);

  // Sync store playing/speed to clock (one-way: store -> clock)
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  playingRef.current = playing;
  speedRef.current = speed;

  useEffect(() => {
    if (playingRef.current !== clock.playing) {
      clock.setPlaying(playingRef.current);
    }
  }, [playing, clock]);

  useEffect(() => {
    if (speedRef.current !== clock.speed) {
      clock.setSpeed(speedRef.current);
    }
  }, [speed, clock]);


  const handleExportCSV = async () => {
    if (selectedSessionIds.length === 0) {
      alert('No sessions selected for export');
      return;
    }

    setIsExporting(true);
    try {
      const csvContent = exportSessionsToCSV(selectedSessionIds, sessions);
      const filename = generateCSVFilename(undefined, selectedSessionIds.length > 1);
      downloadCSV(csvContent, filename);
    } catch (err) {
      console.error('Error exporting sessions:', err);
      alert(err instanceof Error ? err.message : 'Failed to export sessions');
    } finally {
      setIsExporting(false);
    }
  };

  if (selectedSessionIds.length === 0) {
    return (
      <div className="w-screen h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg mb-4">No sessions selected</div>
          <Button onClick={onBack}>Go Back</Button>
        </div>
      </div>
    );
  }

  // Check if we're still loading telemetry
  const isLoading = eventLoading || sessionLoading;

  // Show loading spinner if:
  // 1. We're actively loading telemetry, OR
  // 2. Global time range is not set yet (which means sessions aren't ready)
  if (isLoading || globalTMin === null || globalTMax === null) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" text="Chargement des données de télémétrie..." />
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col">
      {/* Map */}
      <div className="flex-1 relative">
        <ReplayMapWithData currentTime={clock.currentTime} />

        {/* Boat List Panel - overlay top right */}
        <div className="absolute top-4 right-4 z-[1000]">
          <BoatListPanel currentTime={clock.currentTime} />
        </div>

        {/* Top toolbar */}
        <div className="absolute top-4 left-4 z-[1000] flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            ← Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={isExporting || selectedSessionIds.length === 0}
            title="Export all sessions to CSV"
          >
            {isExporting ? 'Exporting...' : '📥 Export CSV'}
          </Button>
          <CsvImportButton />
          {onLogout && (
            <Button variant="outline" size="sm" onClick={onLogout}>
              Déconnexion
            </Button>
          )}
        </div>
      </div>

      {/* Replay Controls - bottom */}
      <ReplayControls 
        currentTime={clock.currentTime}
        setCurrentTime={clock.setCurrentTime}
      />
    </div>
  );
}

