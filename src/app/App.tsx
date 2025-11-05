import { useState, useEffect, useMemo } from 'react';
import { useRaceStore } from '@/state/useRaceStore';
import { LeafletMap } from '@/components/map/LeafletMap';
import { TimeController } from '@/components/timeline/TimeController';
import { CsvDropzone } from '@/components/upload/CsvDropzone';
import { BoatPanel } from '@/components/sidebar/BoatPanel';
import { WidgetSidebar } from '@/components/sidebar/WidgetSidebar';
import { SpeedGaugePair } from '@/components/map/SpeedGaugePair';
import { Button } from '@/components/ui/button';
import { PerformancePanel } from '@/components/debug/PerformancePanel';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [widgetSidebarOpen, setWidgetSidebarOpen] = useState(true);
  const dataset = useRaceStore((state) => state.dataset);
  const drawFullTrack = useRaceStore((state) => state.drawFullTrack);
  const currentTime = useRaceStore((state) => state.currentTime);
  const zoomToBounds = useRaceStore((state) => state.zoomToBounds);
  const timeRange = useRaceStore((state) => state.timeRange);
  const autoFitEnabled = useRaceStore((state) => state.autoFitEnabled);
  const showTWD = useRaceStore((state) => state.showTWD);

  const boats = dataset?.boats || [];
  const filteredBoats = boats; // Later: filter by visibility

  // Calculate available height for speed gauges
  const [availableHeight, setAvailableHeight] = useState(0);
  useEffect(() => {
    const calculateHeight = () => {
      const timeControllerHeight = 220; // Height of TimeController
      const available = window.innerHeight - timeControllerHeight;
      setAvailableHeight(available);
    };

    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    return () => window.removeEventListener('resize', calculateHeight);
  }, []);

  // Calculate speed gauge height (same as wind rose height: 25% of available height)
  const speedGaugeHeight = useMemo(() => {
    if (availableHeight <= 0) return 120;
    return Math.floor(availableHeight * 0.25);
  }, [availableHeight]);

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col">
      {/* Map */}
      <div className="flex-1 relative">
        <LeafletMap
          boats={filteredBoats}
          currentTime={currentTime}
          drawFullTrack={drawFullTrack}
          zoomToBounds={zoomToBounds}
          timeRange={timeRange}
          autoFitEnabled={autoFitEnabled}
          showTWD={showTWD}
        />

        {/* Widget Sidebar */}
        <WidgetSidebar
          boats={filteredBoats}
          currentTime={currentTime}
          onOpenChange={setWidgetSidebarOpen}
        />

        {/* Speed Gauges - positioned to the right of sidebar */}
        {widgetSidebarOpen && (
          <div
            className="fixed left-[300px] top-0 z-[999] transition-all duration-300 ease-in-out"
            style={{
              top: '8px',
              height: `${speedGaugeHeight}px`,
            }}
          >
            <SpeedGaugePair boats={filteredBoats} currentTime={currentTime} height={speedGaugeHeight} />
          </div>
        )}

        {/* Top toolbar */}
        <div className="absolute top-4 right-4 z-[1000] flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            🗺️ Boats
          </Button>
        </div>

        {/* CSV Dropzone */}
        <CsvDropzone />

        {/* Performance Panel (debug mode) */}
        <PerformancePanel />
      </div>

      {/* Timeline Controller */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          widgetSidebarOpen ? 'ml-[320px]' : 'ml-0'
        }`}
      >
        <TimeController />
      </div>

      {/* Sidebar */}
      <BoatPanel open={sidebarOpen} onOpenChange={setSidebarOpen} />
    </div>
  );
}

export default App;
