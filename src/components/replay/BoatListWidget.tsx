import { useMemo } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import type { TrackPoint } from '@/domain/types';

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

interface BoatListWidgetProps {
  currentTime: number;
  onCenterBoat?: (sessionId: string) => void;
}

export function BoatListWidget({ currentTime, onCenterBoat }: BoatListWidgetProps) {
  const sessions = useReplayStore((state) => state.sessions);
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const focusSessionId = useReplayStore((state) => state.focusSessionId);
  const setFocusSession = useReplayStore((state) => state.setFocusSession);
  const hiddenSessionIds = useReplayStore((state) => state.hiddenSessionIds);
  const setHiddenSession = useReplayStore((state) => state.setHiddenSession);
  const toggleHiddenSession = useReplayStore((state) => state.toggleHiddenSession);

  // Calculate current speed for each session
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
            active: false,
          };
        }

        // Find last point at or before currentTime with valid SOG to get speed
        const lastPoint = findLastPointWithSOG(session.points, currentTime);
        const speed = lastPoint?.sog ?? null;

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

  return (
    <div className="absolute top-0 right-0 bg-background/95 backdrop-blur-sm border-l rounded-tl-lg p-2 z-[999] min-w-[180px] max-w-[220px]" style={{ height: 'calc(100vh - 140px)', bottom: '140px' }}>
      <div className="text-xs font-semibold mb-2 px-1 text-muted-foreground">
        Bateaux
      </div>
      <div className="space-y-1 overflow-y-auto" style={{ height: 'calc(100% - 24px)' }}>
        {boatsWithSpeed.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2 text-center">
            Aucun bateau
          </div>
        ) : (
          boatsWithSpeed.map((boat) => {
            const hasData = boat.active && boat.speed !== null;
            const isFocused = focusSessionId === boat.sessionId;
            const isHidden = hiddenSessionIds.has(boat.sessionId);
            return (
              <div
                key={boat.sessionId}
                onClick={() => {
                  // Toggle: si déjà focusé, dé-focuser, sinon focuser
                  if (isFocused) {
                    setFocusSession(null);
                    return;
                  }
                  if (isHidden) {
                    setHiddenSession(boat.sessionId, false);
                  }
                  setFocusSession(boat.sessionId);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  // Center map on boat position at current time (and unhide if needed)
                  if (isHidden) {
                    setHiddenSession(boat.sessionId, false);
                  }
                  onCenterBoat?.(boat.sessionId);
                }}
                className={`flex items-center justify-between gap-2 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                  hasData ? '' : 'opacity-50'
                } ${isHidden ? 'opacity-60' : ''} ${
                  isFocused 
                    ? 'ring-2 ring-primary bg-accent/50 hover:bg-accent/70' 
                    : 'hover:bg-accent/30'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 border border-border"
                    style={{ backgroundColor: boat.color }}
                  />
                  <span
                    className="font-medium truncate flex-1"
                    style={{ color: boat.color }}
                  >
                    {boat.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleHiddenSession(boat.sessionId);
                    }}
                    title={isHidden ? 'Afficher la trace' : 'Masquer la trace'}
                    className={`flex-shrink-0 text-[11px] px-1.5 py-0.5 rounded border transition-colors ${
                      isHidden
                        ? 'bg-muted/50 hover:bg-muted'
                        : 'bg-background/40 border-border hover:bg-accent/30'
                    }`}
                  >
                    {isHidden ? 'Show' : 'Hide'}
                  </button>
                </div>
                <div className="text-right font-mono flex-shrink-0">
                  {boat.speed !== null ? (
                    <span>{boat.speed.toFixed(1)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

