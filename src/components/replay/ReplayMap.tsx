import { useEffect, useRef, useMemo, memo, useCallback, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useReplayStore } from '@/state/useReplayStore';
import { findClosestPoint } from '@/lib/interpolate';
import { computeBounds } from '@/domain/tracks';
import { formatTime } from '@/lib/time';

// Fix default marker icons
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface FitBoundsProps {
  bounds: L.LatLngBounds | null;
  enabled: boolean;
}

function FitBounds({ bounds, enabled }: FitBoundsProps) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (enabled && bounds && !hasFittedRef.current) {
      map.fitBounds(bounds, { padding: [50, 50] });
      hasFittedRef.current = true;
    }
  }, [map, bounds, enabled]);

  return null;
}


/**
 * Create boat icon SVG oriented according to COG (Course Over Ground)
 */
function createBoatIcon(cog: number | undefined, boatColor: string): L.DivIcon {
  // Default angle if COG not available (point north/up)
  const angle = cog !== undefined ? cog : 0;
  // COG is in degrees where 0° = North, 90° = East, etc.
  // SVG rotation needs to account for that (0° should point up)

  const svg = `
    <svg width="24" height="24" viewBox="0 0 24 24" style="transform: rotate(${angle}deg);">
      <path d="M12 2 L18 18 L16 18 L14 12 L10 12 L8 18 L6 18 Z" 
            fill="${boatColor}" 
            stroke="white" 
            stroke-width="2"
            stroke-linejoin="round"/>
    </svg>
  `;

  return L.divIcon({
    className: 'boat-marker',
    html: svg,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

interface BoatMarkerProps {
  sessionId: string;
  position: [number, number] | null;
  color: string;
  name: string;
  speed: number | null;
  cog: number | null;
  currentTime: number | null;
  onFocus?: (sessionId: string) => void;
}

// Memoize boat icons to prevent recreation on every render
const boatIconCache = new Map<string, L.DivIcon>();

function getBoatIcon(cog: number | undefined, color: string): L.DivIcon {
  const key = `${color}-${cog ?? 'none'}`;
  if (!boatIconCache.has(key)) {
    boatIconCache.set(key, createBoatIcon(cog ?? undefined, color));
  }
  return boatIconCache.get(key)!;
}

const BoatMarker = memo(function BoatMarker({ position, color, name, speed, cog, currentTime, sessionId, onFocus }: BoatMarkerProps) {
  if (!position) return null;

  const icon = getBoatIcon(cog ?? undefined, color);

  return (
    <Marker 
      position={position} 
      icon={icon}
      eventHandlers={{
        click: () => {
          if (onFocus) {
            onFocus(sessionId);
          }
        },
      }}
    >
      <Tooltip permanent={false} direction="top" offset={[0, -12]}>
        <div className="text-xs">
          <div className="font-semibold">{name}</div>
          {speed !== null && <div>SOG: {speed.toFixed(1)} kn</div>}
          {cog !== null && <div>COG: {cog.toFixed(1)}°</div>}
          {currentTime && <div>{formatTime(currentTime)}</div>}
        </div>
      </Tooltip>
      <Popup>
        <div className="p-2">
          <div className="font-semibold">{name}</div>
          <div className="text-sm text-muted-foreground">
            Time: {currentTime ? formatTime(currentTime) : 'N/A'}
          </div>
          {speed !== null && <div className="text-sm">SOG: {speed.toFixed(1)} kn</div>}
          {cog !== null && <div className="text-sm">COG: {cog.toFixed(1)}°</div>}
          <div className="text-xs text-muted-foreground mt-1">
            {position[0].toFixed(6)}, {position[1].toFixed(6)}
          </div>
        </div>
      </Popup>
    </Marker>
  );
});

// Component to access map instance and expose center function
interface MapControllerProps {
  onMapReady?: (centerOnBoat: (sessionId: string, currentTime: number) => void) => void;
  currentTime: number;
}

function MapController({ onMapReady }: MapControllerProps) {
  const map = useMap();
  const sessions = useReplayStore((state) => state.sessions);

  const centerOnBoat = useCallback((sessionId: string, time: number) => {
    const session = sessions.get(sessionId);
    if (!session || session.points.length === 0) return;
    
    const closestPoint = findClosestPoint(session.points, time);
    if (closestPoint) {
      const currentZoom = map.getZoom();
      map.setView([closestPoint.lat, closestPoint.lon], currentZoom, {
        animate: true,
        duration: 0.5,
      });
    }
  }, [sessions, map]);

  useEffect(() => {
    if (onMapReady) {
      onMapReady(centerOnBoat);
    }
  }, [onMapReady, centerOnBoat]);

  return null;
}

// Calculate distance between two GPS points using Haversine formula
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// Component to handle map clicks for ruler tool
interface MapClickHandlerProps {
  activeTool: string | null;
  onRulerPointsChange: (start: [number, number] | null, end: [number, number] | null) => void;
}

function MapClickHandler({ activeTool, onRulerPointsChange }: MapClickHandlerProps) {
  const map = useMap();
  const rulerStartRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (activeTool !== 'ruler') {
      // Reset ruler when tool is deactivated
      rulerStartRef.current = null;
      onRulerPointsChange(null, null);
      return;
    }

    const handleClick = (e: L.LeafletMouseEvent) => {
      const point: [number, number] = [e.latlng.lat, e.latlng.lng];
      
      if (!rulerStartRef.current) {
        // First click: set start point
        rulerStartRef.current = point;
        onRulerPointsChange(point, null);
      } else {
        // Second click: set end point
        onRulerPointsChange(rulerStartRef.current, point);
        rulerStartRef.current = null; // Reset for next measurement
      }
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [map, activeTool, onRulerPointsChange]);

  return null;
}

// Component to show temporary line from start point to mouse position
interface RulerTemporaryLineProps {
  startPoint: [number, number];
}

function RulerTemporaryLine({ startPoint }: RulerTemporaryLineProps) {
  const [mousePosition, setMousePosition] = useState<[number, number] | null>(null);

  useMapEvents({
    mousemove: (e) => {
      setMousePosition([e.latlng.lat, e.latlng.lng]);
    },
    mouseout: () => {
      setMousePosition(null);
    },
  });

  if (!mousePosition) return null;

  const distance = calculateDistance(startPoint[0], startPoint[1], mousePosition[0], mousePosition[1]);

  return (
    <>
      <Polyline
        positions={[startPoint, mousePosition]}
        pathOptions={{
          color: '#3b82f6',
          weight: 2,
          opacity: 0.6,
          dashArray: '5, 5',
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <Marker position={mousePosition} interactive={false}>
        <Tooltip permanent={true} direction="top">
          <div className="text-xs">
            {distance < 1
              ? `${(distance * 1000).toFixed(0)} m`
              : `${distance.toFixed(2)} km`}
          </div>
        </Tooltip>
      </Marker>
    </>
  );
}

// Memoized component to prevent unnecessary re-renders
interface ReplayMapContentProps {
  currentTime: number;
  onMapReady?: (centerOnBoat: (sessionId: string, currentTime: number) => void) => void;
  activeTool?: string | null;
}

const ReplayMapContent = memo(function ReplayMapContent({ currentTime, onMapReady, activeTool }: ReplayMapContentProps) {
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const focusSessionId = useReplayStore((state) => state.focusSessionId);
  const setFocusSession = useReplayStore((state) => state.setFocusSession);
  const sessions = useReplayStore((state) => state.sessions);
  const windowStartTime = useReplayStore((state) => state.windowStartTime);
  
  const [rulerStart, setRulerStart] = useState<[number, number] | null>(null);
  const [rulerEnd, setRulerEnd] = useState<[number, number] | null>(null);
  
  const handleBoatFocus = (sessionId: string) => {
    // Toggle: si déjà focusé, dé-focuser, sinon focuser
    setFocusSession(focusSessionId === sessionId ? null : sessionId);
  };
  
  const handleRulerPointsChange = useCallback((start: [number, number] | null, end: [number, number] | null) => {
    setRulerStart(start);
    setRulerEnd(end);
  }, []);
  
  // Reset ruler when tool changes
  useEffect(() => {
    if (activeTool !== 'ruler') {
      setRulerStart(null);
      setRulerEnd(null);
    }
  }, [activeTool]);


  // Display all selected sessions, even if they don't have points loaded yet
  // This allows sessions to appear immediately while telemetry is loading
  const sessionsToDisplay = useMemo(() => {
    return selectedSessionIds;
  }, [selectedSessionIds]);

  // Calculate bounds for auto-fit
  const bounds = useMemo(() => {
    const allPoints: Array<[number, number]> = [];
      sessionsToDisplay.forEach((sessionId) => {
        const session = sessions.get(sessionId);
        if (session) {
          session.points.forEach((p) => {
            allPoints.push([p.lat, p.lon]);
          });
        }
      });
    if (allPoints.length === 0) return null;
    
    const boatTracks = sessionsToDisplay
      .map((sessionId) => {
        const session = sessions.get(sessionId);
        if (!session) return null;
        return {
          id: session.id,
          name: session.name,
          color: session.color,
          points: session.points,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
    
    return computeBounds(boatTracks);
  }, [sessionsToDisplay, sessions]);

  // Render preview and detail polylines + markers
  // Throttle currentTime to reduce re-renders (update every 200ms instead of every frame)
  // Use useRef to track last throttled value and avoid unnecessary recalculations
  const lastThrottledTimeRef = useRef<number | null>(null);
  const throttledCurrentTime = useMemo(() => {
    if (currentTime === null) {
      lastThrottledTimeRef.current = null;
      return null;
    }
    // Round to nearest 200ms to reduce re-renders and prevent flickering
    const throttled = Math.floor(currentTime / 200) * 200;
    
    // Only update if the throttled value actually changed
    if (lastThrottledTimeRef.current === throttled) {
      return lastThrottledTimeRef.current;
    }
    
    lastThrottledTimeRef.current = throttled;
    return throttled;
  }, [currentTime]);

  // Helper function for binary search to find the first point >= time
  function binarySearchStart(points: Array<{ t: number }>, time: number): number {
    let left = 0;
    let right = points.length - 1;
    let result = 0; // Default to 0 if all points are >= time

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (points[mid].t < time) {
        left = mid + 1;
      } else {
        result = mid;
        right = mid - 1;
      }
    }
    return result;
  }

  const mapElements = useMemo(() => {
    // Display all selected sessions, even if they don't have points yet
    return sessionsToDisplay.map((sessionId) => {
      const session = sessions.get(sessionId);
      
      // If session doesn't exist in store yet, return minimal info (will show nothing but won't crash)
      if (!session) {
        return {
          sessionId,
          session: null,
          progressiveTrackPositions: [],
          markerPosition: null,
          markerSpeed: null,
          markerCog: null,
          isFocused: false,
          isLoading: true,
        };
      }

      const isFocused = focusSessionId === sessionId;

      // Progressive track: points within [windowStartTime, currentTime] window
      // If currentTime is null, show full track (all points)
      // If currentTime is before session.tMin, don't show track at all
      // Optimized: use binary search to find cutoff points instead of filtering all points
      let progressiveTrackPositions: Array<[number, number]> = [];
      let startIndex = 0;
      let endIndex: number | 'all' = 'all';
      if (session.points.length > 0) {
        // Determine endIndex based on throttledCurrentTime
        if (throttledCurrentTime !== null && throttledCurrentTime < session.tMin) {
          // Don't show track if cursor is before session start
          progressiveTrackPositions = [];
        } else if (throttledCurrentTime === null) {
          endIndex = session.points.length;
        } else {
          // Binary search to find the last point where t <= currentTime
          // Since points are sorted by time, we can use binary search
          let left = 0;
          let right = session.points.length - 1;
          endIndex = session.points.length;
          
          while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (session.points[mid].t <= throttledCurrentTime) {
              // This point is valid, check if there are more after
              endIndex = mid + 1;
              left = mid + 1;
            } else {
              // This point is after currentTime, search left
              right = mid - 1;
            }
          }
        }

        // Determine startIndex based on windowStartTime
        if (windowStartTime !== null && windowStartTime > session.tMin) {
          startIndex = binarySearchStart(session.points, windowStartTime);
        }

        // Slice points within the [windowStartTime, currentTime] range
        if (progressiveTrackPositions.length === 0) {
          if (endIndex === 'all') {
            // Show full track when currentTime is not set yet
            progressiveTrackPositions = session.points
              .slice(startIndex)
              .map((p) => [p.lat, p.lon] as [number, number]);
          } else {
            // Slice points within the window
            progressiveTrackPositions = session.points
              .slice(startIndex, endIndex)
              .map((p) => [p.lat, p.lon] as [number, number]);
          }
        }
      }

      // Current position marker (closest point)
      let markerPosition: [number, number] | null = null;
      let markerSpeed: number | null = null;
      let markerCog: number | null = null;
      if (throttledCurrentTime !== null && throttledCurrentTime >= session.tMin && throttledCurrentTime <= session.tMax) {
        const closestPoint = findClosestPoint(session.points, throttledCurrentTime);
        if (closestPoint) {
          markerPosition = [closestPoint.lat, closestPoint.lon];
          markerSpeed = closestPoint.sog ?? null;
          markerCog = closestPoint.cog ?? null;
        }
      }

      return {
        sessionId,
        session,
        progressiveTrackPositions,
        markerPosition,
        markerSpeed,
        markerCog,
        isFocused,
        isLoading: false,
      };
    });
  }, [sessionsToDisplay, sessions, throttledCurrentTime, focusSessionId, windowStartTime]);

  // Calculate distance for ruler tool
  const rulerDistance = useMemo(() => {
    if (rulerStart && rulerEnd) {
      return calculateDistance(rulerStart[0], rulerStart[1], rulerEnd[0], rulerEnd[1]);
    }
    return null;
  }, [rulerStart, rulerEnd]);

  return (
    <>
      <MapController onMapReady={onMapReady} currentTime={currentTime} />
      <MapClickHandler activeTool={activeTool ?? null} onRulerPointsChange={handleRulerPointsChange} />
      <FitBounds bounds={bounds} enabled={true} />
      
      {/* Ruler tool visualization */}
      {activeTool === 'ruler' && (
        <>
          {/* Start point marker */}
          {rulerStart && (
            <Marker position={rulerStart}>
              <Tooltip permanent={true} direction="top">
                <div className="text-xs font-semibold">Départ</div>
              </Tooltip>
            </Marker>
          )}
          
          {/* End point marker */}
          {rulerEnd && (
            <Marker position={rulerEnd}>
              <Tooltip permanent={true} direction="top">
                <div className="text-xs font-semibold">Arrivée</div>
              </Tooltip>
            </Marker>
          )}
          
          {/* Ruler line */}
          {rulerStart && rulerEnd && (
            <Polyline
              positions={[rulerStart, rulerEnd]}
              pathOptions={{
                color: '#3b82f6',
                weight: 3,
                opacity: 0.8,
                dashArray: '10, 5',
                lineCap: 'round',
                lineJoin: 'round',
              }}
            >
              <Tooltip permanent={true} direction="center">
                <div className="text-sm font-semibold">
                  {rulerDistance !== null ? (
                    <>
                      {rulerDistance < 1
                        ? `${(rulerDistance * 1000).toFixed(0)} m`
                        : `${rulerDistance.toFixed(2)} km`}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {(rulerDistance * 0.539957).toFixed(2)} NM
                      </span>
                    </>
                  ) : (
                    '0 m'
                  )}
                </div>
              </Tooltip>
            </Polyline>
          )}
          
          {/* Temporary line from start to mouse (when start is set but end is not) */}
          {rulerStart && !rulerEnd && (
            <RulerTemporaryLine startPoint={rulerStart} />
          )}
        </>
      )}

      {/* Render progressive track + markers */}
      {mapElements.map(({ sessionId, session, progressiveTrackPositions, markerPosition, markerSpeed, markerCog, isFocused, isLoading }) => {
        // Skip rendering if session is still loading (no session data yet)
        if (isLoading || !session) {
          return null;
        }

        return (
          <div key={sessionId}>
            {/* Progressive track (all points up to currentTime) - simple color, no SOG coloring */}
            {/* Focused session has thicker, more opaque track */}
            {/* Show track even if it has fewer than 2 points (might be loading) */}
            {progressiveTrackPositions.length >= 2 ? (
              <Polyline
                  positions={progressiveTrackPositions}
                  pathOptions={{
                    color: session.color,
                    weight: isFocused ? 6 : 3,
                    opacity: isFocused ? 1.0 : 0.8,
                    // Add dash pattern for focused boat to make it stand out more
                    dashArray: isFocused ? undefined : undefined,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
            ) : null}

            {/* Current position marker (oriented boat icon) */}
            {markerPosition && (
              <BoatMarker
                key={sessionId}
                sessionId={sessionId}
                position={markerPosition}
                color={session.color}
                name={session.boatDisplayName || session.name}
                speed={markerSpeed}
                cog={markerCog}
                currentTime={throttledCurrentTime}
                onFocus={handleBoatFocus}
              />
            )}
          </div>
        );
      })}
    </>
  );
});

interface ReplayMapProps {
  currentTime: number;
  onMapReady?: (centerOnBoat: (sessionId: string, currentTime: number) => void) => void;
  activeTool?: string | null;
}

export function ReplayMap({ currentTime, onMapReady, activeTool }: ReplayMapProps) {
  return (
    <MapContainer
      center={[46.0, -1.0]}
      zoom={10}
      style={{ height: '100%', width: '100%' }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <ReplayMapContent currentTime={currentTime} onMapReady={onMapReady} activeTool={activeTool} />
    </MapContainer>
  );
}

// Export wrapper (data loading is now handled by useEventTelemetry)
interface ReplayMapWithDataProps {
  currentTime: number;
  onMapReady?: (centerOnBoat: (sessionId: string, currentTime: number) => void) => void;
  activeTool?: string | null;
}

export function ReplayMapWithData({ currentTime, onMapReady, activeTool }: ReplayMapWithDataProps) {
  return <ReplayMap currentTime={currentTime} onMapReady={onMapReady} activeTool={activeTool} />;
}

