import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import { useReplayClock } from '@/hooks/useReplayClock';
import { ReplayMapWithData } from '@/components/replay/ReplayMap';
import { BoatListPanel } from '@/components/replay/BoatListPanel';
import { BoatListWidget } from '@/components/replay/BoatListWidget';
import { GateRankingWidget } from '@/components/replay/GateRankingWidget';
import { ReplayControls } from '@/components/replay/ReplayControls';
import type { Gate, Result, Crossing } from '@/types';
import { CsvImportButton } from '@/components/replay/CsvImportButton';
import { ToolsPanel } from '@/components/replay/ToolsPanel';
import { useTelemetry } from '@/hooks/useTelemetry';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { exportSessionsToCSV } from '@/lib/csv-export';
import { downloadCSV, generateCSVFilename } from '@/lib/csv-download';
import { CourseDetectSheet } from '@/components/replay/CourseDetectSheet';
import {
  detectRoundingMarksFromSessions,
  excludeNearConfirmed,
  type ConfirmedCourseBuoy,
  type InferredMarkCandidate,
} from '@/lib/inferredMarks';

// La vue 3D tire three.js, drei et un modele GLB de ~21 Mo : chargee a la demande
// pour ne pas peser sur le premier rendu de la carte.
const Replay3DView = lazy(() =>
  import('@/views/Replay3DView').then((m) => ({ default: m.Replay3DView }))
);

interface ReplayPageProps {
  onBack: () => void;
  onLogout?: () => void;
  onOpenCsvAgg?: () => void;
}

export function ReplayPage({ onBack, onLogout, onOpenCsvAgg }: ReplayPageProps) {
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const hiddenSessionIds = useReplayStore((state) => state.hiddenSessionIds);
  const sessions = useReplayStore((state) => state.sessions);
  const globalTMin = useReplayStore((state) => state.globalTMin);
  const globalTMax = useReplayStore((state) => state.globalTMax);
  const playing = useReplayStore((state) => state.playing);
  const speed = useReplayStore((state) => state.speed);
  const setWindowStartTime = useReplayStore((state) => state.setWindowStartTime);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [openWidgets, setOpenWidgets] = useState<Set<string>>(new Set());
  const [replayViewMode, setReplayViewMode] = useState<'2d' | '3d'>('2d');
  const [courseDetectOpen, setCourseDetectOpen] = useState(false);
  const [courseCandidates, setCourseCandidates] = useState<InferredMarkCandidate[]>([]);
  const [courseConfirmed, setCourseConfirmed] = useState<ConfirmedCourseBuoy[]>([]);

  // Gate Ranking state
  const [gateStart, setGateStart] = useState<Gate | null>(null);
  const [gateFinish, setGateFinish] = useState<Gate | null>(null);
  const [gateDrawMode, setGateDrawMode] = useState<'none' | 'drawStart' | 'drawFinish'>('none');
  const [gateStartPartial, setGateStartPartial] = useState<{ lat: number; lon: number } | null>(null);
  const [gateFinishPartial, setGateFinishPartial] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedBoatId, setSelectedBoatId] = useState<string | null>(null);
  const [rankings, setRankings] = useState<Result[]>([]);
  const [crossingsByBoat, setCrossingsByBoat] = useState<Map<string, { start?: Crossing; finish?: Crossing }>>(new Map());
  
  // Track if clock has been initialized to avoid resetting user's cursor position
  const clockInitializedRef = useRef(false);
  
  // Store the centerOnBoat function from the map
  const centerOnBoatRef = useRef<((sessionId: string, currentTime: number) => void) | null>(null);
  
  const handleMapReady = useCallback((centerOnBoat: (sessionId: string, currentTime: number) => void) => {
    centerOnBoatRef.current = centerOnBoat;
  }, []);

  const runCourseDetection = useCallback(() => {
    const visibleIds = selectedSessionIds.filter((id) => !hiddenSessionIds.has(id));
    const raw = detectRoundingMarksFromSessions(sessions, visibleIds);
    setCourseCandidates(excludeNearConfirmed(raw, courseConfirmed));
    setCourseDetectOpen(true);
  }, [selectedSessionIds, hiddenSessionIds, sessions, courseConfirmed]);

  const handleConfirmCourseCandidate = useCallback((id: string) => {
    setCourseCandidates((prev) => {
      const c = prev.find((x) => x.id === id);
      if (!c) return prev;
      setCourseConfirmed((conf) => [...conf, { id: crypto.randomUUID(), lat: c.lat, lon: c.lon }]);
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const handleRejectCourseCandidate = useCallback((id: string) => {
    setCourseCandidates((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const handleClearConfirmedBuoys = useCallback(() => {
    setCourseConfirmed([]);
  }, []);

  // Load telemetry using unified hook
  const { loading } = useTelemetry();

  // Initialize replay clock (only when times are available)
  // Note: globalTMax should never be null here due to spinner check above
  // But if it is, use globalTMin instead of Date.now() to avoid setting to current time
  const clock = useReplayClock(
    globalTMin ?? 0,
    globalTMin ?? 0,
    globalTMax ?? (globalTMin ?? 0),
    speed
  );

  // Initialize clock time and windowStartTime only once when data is first loaded
  useEffect(() => {
    if (loading) {
      // Reset initialization flag when loading starts
      clockInitializedRef.current = false;
      return;
    }
    if (globalTMin !== null && globalTMax !== null && !clockInitializedRef.current) {
      clock.setCurrentTime(globalTMax);
      setWindowStartTime(globalTMin, globalTMax);
      clockInitializedRef.current = true;
    }
  }, [globalTMin, globalTMax, clock, loading, setWindowStartTime]);

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

  // Show loading spinner if:
  // 1. We're actively loading telemetry, OR
  // 2. Global time range is not set yet (which means sessions aren't ready)
  if (loading || globalTMin === null || globalTMax === null) {
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
        {/* Tools Panel - left side */}
        <ToolsPanel 
          activeTool={activeTool} 
          onToolChange={setActiveTool}
          openWidgets={openWidgets}
          onToggleWidget={(widgetId) => {
            setOpenWidgets((prev) => {
              const next = new Set(prev);
              // If opening boatList or gateRanking, close the other one (mutually exclusive)
              if (widgetId === 'boatList' || widgetId === 'gateRanking') {
                next.delete('boatList');
                next.delete('gateRanking');
                // If the clicked widget was already open, don't add it (toggle off)
                // Otherwise, add it (toggle on)
                if (!prev.has(widgetId)) {
                  next.add(widgetId);
                }
              } else {
                // For other widgets, normal toggle behavior
                if (next.has(widgetId)) {
                  next.delete(widgetId);
                } else {
                  next.add(widgetId);
                }
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
            courseBuoyCandidates={courseCandidates}
            courseBuoysConfirmed={courseConfirmed}
          />
        ) : (
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><LoadingSpinner /></div>}>
            <Replay3DView currentTime={clock.currentTime} />
          </Suspense>
        )}

        {/* Boat List Widget - always visible, compact format */}
        <BoatListWidget 
          currentTime={clock.currentTime}
          onCenterBoat={(sessionId) => {
            if (centerOnBoatRef.current) {
              centerOnBoatRef.current(sessionId, clock.currentTime);
            }
          }}
        />

        {/* Boat List Panel - overlay top right to bottom (above time controller) */}
        {openWidgets.has('boatList') && (
          <div className="absolute top-0 right-0 z-[1000]" style={{ height: 'calc(100vh - 140px)', bottom: '140px' }}>
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

        {/* Gate Ranking Widget - overlay top right to bottom (above time controller) */}
        {openWidgets.has('gateRanking') && (
          <div className="absolute top-0 right-0 z-[1000]" style={{ height: 'calc(100vh - 140px)', bottom: '140px' }}>
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

        {/* Top toolbar */}
        <div className="absolute top-4 left-16 z-[1000] flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            ← Back
          </Button>
          <div className="flex gap-1 rounded-md border bg-background/90 p-0.5">
            <Button
              variant={replayViewMode === '2d' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3"
              onClick={() => setReplayViewMode('2d')}
            >
              Vue 2D
            </Button>
            <Button
              variant={replayViewMode === '3d' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3"
              onClick={() => setReplayViewMode('3d')}
            >
              Vue 3D
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            title="Détecter des bouées probables depuis les virages GPS"
            onClick={runCourseDetection}
          >
            Parcours (GPS)
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
          {onOpenCsvAgg && (
            <Button variant="outline" size="sm" onClick={onOpenCsvAgg}>
              CSV agg
            </Button>
          )}
          {onLogout && (
            <Button variant="outline" size="sm" onClick={onLogout}>
              Déconnexion
            </Button>
          )}
        </div>

        <CourseDetectSheet
          open={courseDetectOpen}
          onOpenChange={setCourseDetectOpen}
          candidates={courseCandidates}
          confirmed={courseConfirmed}
          onConfirmCandidate={handleConfirmCourseCandidate}
          onRejectCandidate={handleRejectCourseCandidate}
          onClearConfirmed={handleClearConfirmedBuoys}
        />
      </div>

      {/* Replay Controls - bottom */}
      <ReplayControls 
        currentTime={clock.currentTime}
        setCurrentTime={clock.setCurrentTime}
      />
    </div>
  );
}

