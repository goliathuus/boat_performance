import { useEffect, useMemo, useState } from 'react';
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

const EyeIcon = ({ off }: { off: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    ) : (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

/** Replie le panneau par defaut sous 640 px : a 375 px il mangeait 60 % de la carte. */
function useCollapsedByDefaultOnSmall() {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 640px)').matches
  );
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = () => {
      if (!pinned) setCollapsed(!mq.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pinned]);

  return {
    collapsed,
    toggle: () => {
      setPinned(true);
      setCollapsed((c) => !c);
    },
  };
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
  const { collapsed, toggle } = useCollapsedByDefaultOnSmall();

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

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        title="Afficher la liste des bateaux"
        aria-label="Afficher la liste des bateaux"
        aria-expanded="false"
        className="absolute top-2 right-0 z-[999] flex items-center gap-1.5 rounded-l-md border border-r-0 bg-background/95 backdrop-blur-sm px-2 py-1.5 text-xs font-medium shadow-sm hover:bg-accent/40 transition-colors"
      >
        <span className="flex -space-x-1">
          {boatsWithSpeed.slice(0, 4).map((boat) => (
            <span
              key={boat.sessionId}
              className="h-2.5 w-2.5 rounded-full ring-1 ring-background"
              style={{ backgroundColor: boat.color }}
            />
          ))}
        </span>
        {boatsWithSpeed.length}
      </button>
    );
  }

  return (
    <div className="absolute inset-y-0 right-0 flex flex-col bg-background/95 backdrop-blur-sm border-l rounded-tl-lg p-2 z-[999] w-[168px] sm:w-[210px] max-w-[70vw]">
      <div className="flex items-center justify-between gap-2 mb-2 px-1 flex-none">
        <span className="text-xs font-semibold text-muted-foreground">Bateaux</span>
        <button
          type="button"
          onClick={toggle}
          title="Replier la liste"
          aria-label="Replier la liste des bateaux"
          aria-expanded="true"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
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
                    aria-label={isHidden ? 'Afficher la trace' : 'Masquer la trace'}
                    className={`flex-shrink-0 grid place-items-center h-5 w-5 rounded border transition-colors ${
                      isHidden
                        ? 'bg-muted/50 border-border hover:bg-muted text-muted-foreground'
                        : 'bg-background/40 border-border hover:bg-accent/30'
                    }`}
                  >
                    <EyeIcon off={isHidden} />
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

