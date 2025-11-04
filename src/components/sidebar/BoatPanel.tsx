import { useRaceStore } from '@/state/useRaceStore';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { computeBounds } from '@/domain/tracks';
import type { BoatTrack } from '@/domain/types';

interface BoatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BoatPanel({ open, onOpenChange }: BoatPanelProps) {
  const dataset = useRaceStore((state) => state.dataset);
  const drawFullTrack = useRaceStore((state) => state.drawFullTrack);
  const toggleDrawFull = useRaceStore((state) => state.toggleDrawFull);
  const triggerZoom = useRaceStore((state) => state.triggerZoom);

  // For now, all boats are visible. Later we can add visibility state per boat.
  const visibleBoats = dataset?.boats || [];

  const handleZoomToBoat = (boat: BoatTrack) => {
    const bounds = computeBounds([boat]);
    if (bounds) {
      triggerZoom(bounds);
    }
  };

  const handleZoomToFit = () => {
    if (dataset) {
      const bounds = computeBounds(visibleBoats);
      if (bounds) {
        triggerZoom(bounds);
      }
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right">
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Boats</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
          >
            ✕
          </Button>
        </div>

        <div className="flex items-center justify-between mb-4 pb-4 border-b">
          <span className="text-sm">Draw full track</span>
          <Toggle pressed={drawFullTrack} onPressedChange={toggleDrawFull} />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleZoomToFit}
          className="mb-4"
          disabled={!dataset || visibleBoats.length === 0}
        >
          🔍 Zoom to Fit All
        </Button>

        {!dataset || visibleBoats.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No boats loaded
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2">
            {visibleBoats.map((boat) => (
              <div
                key={boat.id}
                className="p-3 border rounded-lg hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: boat.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{boat.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {boat.points.length} points
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleZoomToBoat(boat)}
                  >
                    🔍
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
