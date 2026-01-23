import { useMemo, useState, useEffect } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import type { TrackPoint } from '@/domain/types';
import { exportSessionsToCSV } from '@/lib/csv-export';
import { downloadCSV, generateCSVFilename } from '@/lib/csv-download';
import { Button } from '@/components/ui/button';
import { calculateAverageSOGAndCOG } from '@/domain/tracks';

// Helper to find the last point at or before currentTime with valid SOG
function findLastPointWithSOG(points: TrackPoint[], currentTime: number): TrackPoint | null {
  if (points.length === 0) return null;
  
  // Find the last point where t <= currentTime AND has valid SOG
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].t <= currentTime && points[i].sog !== undefined && points[i].sog !== null) {
      return points[i];
    }
  }
  
  // If no point with SOG found, return null
  return null;
}

type SortMode = 'speed' | 'avgSpeed' | 'selection';

interface BoatListPanelProps {
  sortMode?: SortMode;
  currentTime: number;
  onCenterBoat?: (sessionId: string) => void;
}

export function BoatListPanel({ sortMode: propSortMode, currentTime, onCenterBoat }: BoatListPanelProps) {
  const sessions = useReplayStore((state) => state.sessions);
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const focusSessionId = useReplayStore((state) => state.focusSessionId);
  const setFocusSession = useReplayStore((state) => state.setFocusSession);
  const windowStartTime = useReplayStore((state) => state.windowStartTime);
  const [isExporting, setIsExporting] = useState(false);
  const [localSortMode, setLocalSortMode] = useState<SortMode>(propSortMode ?? 'speed');
  const [isVisible, setIsVisible] = useState(true);
  
  // Sync local state with prop if prop changes
  useEffect(() => {
    if (propSortMode !== undefined) {
      setLocalSortMode(propSortMode);
    }
  }, [propSortMode]);
  
  // Use local state if no prop provided, otherwise use prop
  const sortMode = propSortMode ?? localSortMode;

  // Calculate current speed and averages for each session
  const boatsWithSpeed = useMemo(() => {
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
            cog: null,
            active: false,
            avgSOG: null,
            avgCOG: null,
          };
        }

        // Find last point at or before currentTime with valid SOG to get speed and COG
        const lastPoint = findLastPointWithSOG(session.points, currentTime);
        const speed = lastPoint?.sog ?? null;
        const cog = lastPoint?.cog ?? null;

        // Calculate average SOG and COG over the slider window [windowStartTime, currentTime]
        let avgSOG: number | null = null;
        let avgCOG: number | null = null;
        if (windowStartTime !== null && windowStartTime < currentTime) {
          const averages = calculateAverageSOGAndCOG(
            session.points,
            windowStartTime,
            currentTime
          );
          if (averages) {
            avgSOG = averages.avgSOG;
            avgCOG = averages.avgCOG;
          }
        }

        return {
          sessionId,
          name: session.name,
          color: session.color,
          speed,
          cog,
          active: true,
          avgSOG,
          avgCOG,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [selectedSessionIds, sessions, currentTime, windowStartTime]);

  // Sort boats
  const sortedBoats = useMemo(() => {
    if (sortMode === 'speed') {
      // Sort by instantaneous SOG (current speed)
      return [...boatsWithSpeed].sort((a, b) => {
        if (a.speed === null && b.speed === null) return 0;
        if (a.speed === null) return 1;
        if (b.speed === null) return -1;
        return b.speed - a.speed; // Descending
      });
    } else if (sortMode === 'avgSpeed') {
      // Sort by average SOG over the time window
      return [...boatsWithSpeed].sort((a, b) => {
        if (a.avgSOG === null && b.avgSOG === null) return 0;
        if (a.avgSOG === null) return 1;
        if (b.avgSOG === null) return -1;
        return b.avgSOG - a.avgSOG; // Descending
      });
    }
    // Selection order - maintain original order from selectedSessionIds
    return boatsWithSpeed;
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
    <div className="relative h-full">
      {/* Conteneur avec overflow pour l'animation - permet au bouton de dépasser à gauche */}
      <div className="relative h-full" style={{ overflowX: 'visible', marginLeft: '32px' }}>
        {/* Tableau avec animation de glissement */}
        <div
          className={`bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg p-4 transition-transform duration-300 ease-in-out h-full flex flex-col relative`}
          style={{
            width: '400px',
            transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          }}
        >
          {/* Bouton qui glisse avec le tableau */}
          <button
            onClick={() => setIsVisible(!isVisible)}
            className="absolute left-0 top-0 h-12 w-8 bg-background/95 backdrop-blur-sm border border-r-0 rounded-l-lg shadow-lg z-10 flex items-center justify-center hover:bg-accent/30 transition-colors"
            title={isVisible ? "Cacher le tableau" : "Afficher le tableau"}
            style={{ left: '-32px' }}
          >
            <span className="text-sm">{isVisible ? '◀' : '▶'}</span>
          </button>
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
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

          {/* Sort buttons */}
          <div className="flex gap-1 mb-3 flex-shrink-0">
        <Button
          variant={sortMode === 'avgSpeed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setLocalSortMode('avgSpeed')}
          className="flex-1 text-xs h-7"
          title="Sort by average SOG"
        >
          Avg SOG
        </Button>
        <Button
          variant={sortMode === 'speed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setLocalSortMode('speed')}
          className="flex-1 text-xs h-7"
          title="Sort by instantaneous SOG"
        >
          Instant SOG
        </Button>
        <Button
          variant={sortMode === 'selection' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setLocalSortMode('selection')}
          className="flex-1 text-xs h-7"
          title="Sort by selection order"
        >
          Selection
        </Button>
      </div>

          {/* Table container with scroll */}
          <div className="overflow-y-auto flex-1 min-h-0">
        {sortedBoats.length === 0 ? (
          <div className="text-center text-muted-foreground py-4 text-sm">
            No boats selected
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b">
              <tr>
                <th className="text-left p-2 font-semibold text-xs">Nom</th>
                <th className="text-right p-2 font-semibold text-xs">SOG inst</th>
                <th className="text-right p-2 font-semibold text-xs">COG inst</th>
                <th className="text-right p-2 font-semibold text-xs">SOG moy</th>
                <th className="text-right p-2 font-semibold text-xs">COG moy</th>
              </tr>
            </thead>
            <tbody>
              {sortedBoats.map((boat, index) => {
                const isFocused = focusSessionId === boat.sessionId;
                return (
                  <tr
                    key={boat.sessionId}
                    onClick={() => {
                      // Toggle: si déjà focusé, dé-focuser, sinon focuser
                      setFocusSession(isFocused ? null : boat.sessionId);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      // Center map on boat position at current time
                      if (onCenterBoat) {
                        onCenterBoat(boat.sessionId);
                      }
                    }}
                    className={`cursor-pointer transition-colors ${
                      index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                    } ${
                      boat.active ? '' : 'opacity-50'
                    } ${
                      isFocused 
                        ? 'ring-2 ring-primary bg-accent/50 hover:bg-accent/70' 
                        : 'hover:bg-accent/30'
                    }`}
                  >
                    {/* Nom du bateau */}
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0 border border-border"
                          style={{ backgroundColor: boat.color }}
                        />
                        <span
                          className="font-medium truncate"
                          style={{ color: boat.color }}
                        >
                          {boat.name}
                        </span>
                      </div>
                    </td>
                    {/* SOG instantanée */}
                    <td className="p-2 text-right font-mono">
                      {boat.speed !== null ? (
                        <span>{boat.speed.toFixed(1)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {/* COG instantanée */}
                    <td className="p-2 text-right font-mono">
                      {boat.cog !== null && boat.cog !== undefined ? (
                        <span>{boat.cog.toFixed(0)}°</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {/* SOG moyenne */}
                    <td className="p-2 text-right font-mono">
                      {boat.avgSOG !== null ? (
                        <span>{boat.avgSOG.toFixed(1)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {/* COG moyenne */}
                    <td className="p-2 text-right font-mono">
                      {boat.avgCOG !== null ? (
                        <span>{boat.avgCOG.toFixed(0)}°</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}

