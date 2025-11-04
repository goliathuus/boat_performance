import { useState } from 'react';
import { useRaceStore } from '@/state/useRaceStore';
import { LeafletMap } from '@/components/map/LeafletMap';
import { SpeedGaugePair } from '@/components/map/SpeedGaugePair';
import { WindRose } from '@/components/map/WindRose';
import { TimeController } from '@/components/timeline/TimeController';
import { CsvDropzone } from '@/components/upload/CsvDropzone';
import { BoatPanel } from '@/components/sidebar/BoatPanel';
import { Button } from '@/components/ui/button';
import { PerformancePanel } from '@/components/debug/PerformancePanel';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dataset = useRaceStore((state) => state.dataset);
  const drawFullTrack = useRaceStore((state) => state.drawFullTrack);
  const currentTime = useRaceStore((state) => state.currentTime);
  const zoomToBounds = useRaceStore((state) => state.zoomToBounds);
  const timeRange = useRaceStore((state) => state.timeRange);
  const autoFitEnabled = useRaceStore((state) => state.autoFitEnabled);
  const showTWD = useRaceStore((state) => state.showTWD);

  const boats = dataset?.boats || [];
  const filteredBoats = boats; // Later: filter by visibility

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

        {/* Wind Rose Overlay */}
        <WindRose boats={filteredBoats} currentTime={currentTime} />

        {/* Speed Gauge Pair Overlay */}
        <SpeedGaugePair boats={filteredBoats} currentTime={currentTime} />

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
      <TimeController />

      {/* Sidebar */}
      <BoatPanel open={sidebarOpen} onOpenChange={setSidebarOpen} />
    </div>
  );
}

export default App;
