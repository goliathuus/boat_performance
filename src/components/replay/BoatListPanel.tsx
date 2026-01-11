import { useMemo, useState } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import { findClosestPoint } from '@/lib/interpolate';
import { exportSessionsToCSV } from '@/lib/csv-export';
import { downloadCSV, generateCSVFilename } from '@/lib/csv-download';
import { Button } from '@/components/ui/button';

type SortMode = 'speed' | 'selection';

interface BoatListPanelProps {
  sortMode?: SortMode;
}

export function BoatListPanel({ sortMode = 'speed' }: BoatListPanelProps) {
  const sessions = useReplayStore((state) => state.sessions);
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const currentTime = useReplayStore((state) => state.currentTime);
  const [isExporting, setIsExporting] = useState(false);

  // Calculate current speed for each session
  const boatsWithSpeed = useMemo(() => {
    if (currentTime === null) {
      return [];
    }

    return selectedSessionIds
      .map((sessionId) => {
        const session = sessions.get(sessionId);
        if (!session) return null;

        // Check if session is active at currentTime
        if (currentTime < session.tMin || currentTime > session.tMax) {
          return {
            sessionId,
            name: session.name,
            color: session.color,
            speed: null,
            active: false,
          };
        }

        // Find closest point to get speed
        const closestPoint = findClosestPoint(session.points, currentTime);
        const speed = closestPoint?.sog ?? null;

        return {
          sessionId,
          name: session.name,
          color: session.color,
          speed,
          active: true,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [selectedSessionIds, sessions, currentTime]);

  // Sort boats
  const sortedBoats = useMemo(() => {
    if (sortMode === 'speed') {
      return [...boatsWithSpeed].sort((a, b) => {
        if (a.speed === null && b.speed === null) return 0;
        if (a.speed === null) return 1;
        if (b.speed === null) return -1;
        return b.speed - a.speed; // Descending
      });
    }
    return boatsWithSpeed; // Selection order
  }, [boatsWithSpeed, sortMode]);

  const handleExportAll = async () => {
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

  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg p-4 w-80">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Boats</h2>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">
            {sortedBoats.length} boat{sortedBoats.length !== 1 ? 's' : ''}
          </div>
          {selectedSessionIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportAll}
              disabled={isExporting}
              className="h-7 px-2 text-xs"
              title="Export all sessions to CSV"
            >
              {isExporting ? '...' : '📥'}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        {sortedBoats.length === 0 ? (
          <div className="text-center text-muted-foreground py-4 text-sm">
            No boats selected
          </div>
        ) : (
          sortedBoats.map((boat) => (
            <div
              key={boat.sessionId}
              className={`flex items-center gap-3 p-2 rounded ${
                boat.active ? '' : 'opacity-50'
              }`}
            >
              {/* Color swatch */}
              <div
                className="w-4 h-4 rounded-full flex-shrink-0 border border-border"
                style={{ backgroundColor: boat.color }}
              />
              
              {/* Boat name */}
              <div className="flex-1 min-w-0">
                <div
                  className="font-medium text-sm truncate"
                  style={{ color: boat.color }}
                >
                  {boat.name}
                </div>
              </div>

              {/* Speed */}
              <div className="text-sm font-mono text-right flex-shrink-0">
                {boat.speed !== null ? (
                  <>
                    <span className="font-semibold">{boat.speed.toFixed(1)}</span>
                    <span className="text-muted-foreground ml-1">kn</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

