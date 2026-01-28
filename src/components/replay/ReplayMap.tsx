import { useEffect, useRef, useMemo, memo, useCallback, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useReplayStore } from '@/state/useReplayStore';
import type { TrackPoint } from '@/domain/types';
import type { Gate, Result, Crossing } from '@/types';
import { computeGateRankings, type Vec2 } from '@/lib/gateRanking';
// Helper to find the last point at or before currentTime
function findLastPoint(points: TrackPoint[], currentTime: number): TrackPoint | null {
  if (points.length === 0) return null;
  
  // Find the last point where t <= currentTime
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].t <= currentTime) {
      return points[i];
    }
  }
  
  // If no point found, return null (currentTime is before all points)
  return null;
}
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
    
    const lastPoint = findLastPoint(session.points, time);
    if (lastPoint) {
      const currentZoom = map.getZoom();
      map.setView([lastPoint.lat, lastPoint.lon], currentZoom, {
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

// Component to provide projection function for gate ranking
interface GateRankingCalculatorProps {
  gateStart: Gate | null;
  gateFinish: Gate | null;
  boats: Array<{ id: string; name: string; points: TrackPoint[] }>;
  onRankingsComputed: (results: Result[], crossingsByBoat: Map<string, { start?: Crossing; finish?: Crossing }>) => void;
}

function GateRankingCalculator({ gateStart, gateFinish, boats, onRankingsComputed }: GateRankingCalculatorProps) {
  const map = useMap();

  useEffect(() => {
    if (!gateStart || !gateFinish || boats.length === 0) {
      onRankingsComputed([], new Map());
      return;
    }

    // Create project function using Leaflet's latLngToLayerPoint
    const project: (lon: number, lat: number) => Vec2 = (lon, lat) => {
      const point = map.latLngToLayerPoint(L.latLng(lat, lon));
      return { x: point.x, y: point.y };
    };

    // Convert sessions to BoatTrack format
    const boatTracks = boats.map((boat) => ({
      id: boat.id,
      name: boat.name,
      points: boat.points.map((p) => ({
        lat: p.lat,
        lon: p.lon,
        t: p.t,
      })),
    }));

    const result = computeGateRankings(boatTracks, gateStart, gateFinish, project);
    onRankingsComputed(result.results, result.crossingsByBoat);
  }, [gateStart, gateFinish, boats, map, onRankingsComputed]);

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

// Component to handle map clicks for ruler tool and gate drawing
interface MapClickHandlerProps {
  activeTool: string | null;
  onRulerPointsChange: (start: [number, number] | null, end: [number, number] | null) => void;
  gateDrawMode: 'none' | 'drawStart' | 'drawFinish';
  onGatePoint: (point: { lat: number; lon: number }, gateType: 'start' | 'finish') => void;
}

function MapClickHandler({ activeTool, onRulerPointsChange, gateDrawMode, onGatePoint }: MapClickHandlerProps) {
  const map = useMap();
  const rulerStartRef = useRef<[number, number] | null>(null);
  const gateStartRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (activeTool !== 'ruler' && gateDrawMode === 'none') {
      // Reset ruler when tool is deactivated
      rulerStartRef.current = null;
      onRulerPointsChange(null, null);
      gateStartRef.current = null;
      return;
    }

    const handleClick = (e: L.LeafletMouseEvent) => {
      const point: [number, number] = [e.latlng.lat, e.latlng.lng];
      
      // Handle ruler tool
      if (activeTool === 'ruler') {
        if (!rulerStartRef.current) {
          // First click: set start point
          rulerStartRef.current = point;
          onRulerPointsChange(point, null);
        } else {
          // Second click: set end point
          onRulerPointsChange(rulerStartRef.current, point);
          rulerStartRef.current = null; // Reset for next measurement
        }
        return;
      }

      // Handle gate drawing
      if (gateDrawMode === 'drawStart' || gateDrawMode === 'drawFinish') {
        const gateType = gateDrawMode === 'drawStart' ? 'start' : 'finish';
        
        if (!gateStartRef.current) {
          // First click: set start point
          gateStartRef.current = { lat: point[0], lon: point[1] };
          onGatePoint({ lat: point[0], lon: point[1] }, gateType);
        } else {
          // Second click: set end point and complete gate
          onGatePoint({ lat: point[0], lon: point[1] }, gateType);
          gateStartRef.current = null; // Reset for next gate
        }
      }
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [map, activeTool, gateDrawMode, onRulerPointsChange, onGatePoint]);

  // Reset gate drawing state when mode changes
  useEffect(() => {
    if (gateDrawMode === 'none') {
      gateStartRef.current = null;
    }
  }, [gateDrawMode]);

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
  isGateRankingOpen?: boolean;
  gateStart: Gate | null;
  gateFinish: Gate | null;
  gateDrawMode: 'none' | 'drawStart' | 'drawFinish';
  gateStartPartial: { lat: number; lon: number } | null;
  gateFinishPartial: { lat: number; lon: number } | null;
  rankings: Result[];
  crossingsByBoat: Map<string, { start?: Crossing; finish?: Crossing }>;
  selectedBoatId: string | null;
  onSetGateStart: (gate: Gate | null) => void;
  onSetGateFinish: (gate: Gate | null) => void;
  onSetGateDrawMode: (mode: 'none' | 'drawStart' | 'drawFinish') => void;
  onSetGateStartPartial: (point: { lat: number; lon: number } | null) => void;
  onSetGateFinishPartial: (point: { lat: number; lon: number } | null) => void;
  onSetRankings: (rankings: Result[]) => void;
  onSetCrossingsByBoat: (crossings: Map<string, { start?: Crossing; finish?: Crossing }>) => void;
  onSetSelectedBoatId: (boatId: string | null) => void;
}

const ReplayMapContent = memo(function ReplayMapContent({ 
  currentTime, 
  onMapReady, 
  activeTool, 
  isGateRankingOpen: _isGateRankingOpen = false,
  gateStart,
  gateFinish,
  gateDrawMode,
  gateStartPartial,
  gateFinishPartial,
  rankings: _rankings,
  crossingsByBoat,
  selectedBoatId,
  onSetGateStart,
  onSetGateFinish,
  onSetGateDrawMode,
  onSetGateStartPartial,
  onSetGateFinishPartial,
  onSetRankings,
  onSetCrossingsByBoat,
  onSetSelectedBoatId: _onSetSelectedBoatId,
}: ReplayMapContentProps) {
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const focusSessionId = useReplayStore((state) => state.focusSessionId);
  const setFocusSession = useReplayStore((state) => state.setFocusSession);
  const sessions = useReplayStore((state) => state.sessions);
  const windowStartTime = useReplayStore((state) => state.windowStartTime);
  
  const [rulerStart, setRulerStart] = useState<[number, number] | null>(null);
  const [rulerEnd, setRulerEnd] = useState<[number, number] | null>(null);
  
  // Gate drawing state - now from props
  
  const handleBoatFocus = (sessionId: string) => {
    // Toggle: si déjà focusé, dé-focuser, sinon focuser
    setFocusSession(focusSessionId === sessionId ? null : sessionId);
  };
  
  const handleRulerPointsChange = useCallback((start: [number, number] | null, end: [number, number] | null) => {
    setRulerStart(start);
    setRulerEnd(end);
  }, []);

  const handleGatePoint = useCallback((point: { lat: number; lon: number }, gateType: 'start' | 'finish') => {
    if (gateType === 'start') {
      if (!gateStartPartial) {
        // First point
        onSetGateStartPartial(point);
      } else {
        // Second point - complete the gate
        onSetGateStart({ a: gateStartPartial, b: point });
        onSetGateStartPartial(null);
        onSetGateDrawMode('none');
      }
    } else {
      if (!gateFinishPartial) {
        // First point
        onSetGateFinishPartial(point);
      } else {
        // Second point - complete the gate
        onSetGateFinish({ a: gateFinishPartial, b: point });
        onSetGateFinishPartial(null);
        onSetGateDrawMode('none');
      }
    }
  }, [gateStartPartial, gateFinishPartial, onSetGateStart, onSetGateFinish, onSetGateStartPartial, onSetGateFinishPartial, onSetGateDrawMode]);
  
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
      // Only show track if it intersects with the window
      // Optimized: use binary search to find cutoff points instead of filtering all points
      let progressiveTrackPositions: Array<[number, number]> = [];
      
      if (session.points.length > 0) {
        // Check if session intersects with the window
        const hasWindow = windowStartTime !== null && throttledCurrentTime !== null;
        let shouldShowTrack = true;
        
        if (hasWindow) {
          // If both windowStartTime and currentTime are defined, check if session intersects
          if (session.tMax < windowStartTime || session.tMin > throttledCurrentTime) {
            // Session is completely outside the window, don't show it
            shouldShowTrack = false;
          }
        }
        
        if (shouldShowTrack) {
          let startIndex = 0;
          let endIndex: number | 'all' = 'all';
          
          // Determine endIndex based on throttledCurrentTime
          if (throttledCurrentTime !== null && throttledCurrentTime < session.tMin) {
            // Don't show track if cursor is before session start
            shouldShowTrack = false;
          } else if (throttledCurrentTime === null) {
            // If currentTime is null, check if windowStartTime is after session end
            if (windowStartTime !== null && windowStartTime > session.tMax) {
              shouldShowTrack = false;
            } else {
              endIndex = session.points.length;
            }
          } else {
            // Binary search to find the last point where t <= currentTime
            let left = 0;
            let right = session.points.length - 1;
            endIndex = session.points.length;
            
            while (left <= right) {
              const mid = Math.floor((left + right) / 2);
              if (session.points[mid].t <= throttledCurrentTime) {
                endIndex = mid + 1;
                left = mid + 1;
              } else {
                right = mid - 1;
              }
            }
          }

          if (shouldShowTrack) {
            // Determine startIndex based on windowStartTime
            if (windowStartTime !== null) {
              if (windowStartTime > session.tMax) {
                // windowStartTime is after session end, don't show
                shouldShowTrack = false;
              } else if (windowStartTime > session.tMin) {
                startIndex = binarySearchStart(session.points, windowStartTime);
              }
            }

            if (shouldShowTrack) {
              // Check if there are any points in the window
              if (endIndex !== 'all' && startIndex >= endIndex) {
                // No points in the window
                shouldShowTrack = false;
              } else if (endIndex === 'all' && windowStartTime !== null && startIndex >= session.points.length) {
                // windowStartTime is after all points
                shouldShowTrack = false;
              }
            }

            if (shouldShowTrack) {
              // Slice points within the [windowStartTime, currentTime] range
              if (endIndex === 'all') {
                // Show from windowStartTime to end when currentTime is not set yet
                progressiveTrackPositions = session.points
                  .slice(startIndex)
                  .map((p) => [p.lat, p.lon] as [number, number]);
              } else {
                // Slice points within the window [windowStartTime, currentTime]
                progressiveTrackPositions = session.points
                  .slice(startIndex, endIndex)
                  .map((p) => [p.lat, p.lon] as [number, number]);
              }
            }
          }
        }
      }

      // Current position marker (closest point)
      let markerPosition: [number, number] | null = null;
      let markerSpeed: number | null = null;
      let markerCog: number | null = null;
      if (throttledCurrentTime !== null && throttledCurrentTime >= session.tMin && throttledCurrentTime <= session.tMax) {
        const lastPoint = findLastPoint(session.points, throttledCurrentTime);
        if (lastPoint) {
          markerPosition = [lastPoint.lat, lastPoint.lon];
          markerSpeed = lastPoint.sog ?? null;
          markerCog = lastPoint.cog ?? null;
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

  // Prepare boats for ranking calculation
  const boatsForRanking = useMemo(() => {
    return sessionsToDisplay
      .map((sessionId) => {
        const session = sessions.get(sessionId);
        if (!session || session.points.length === 0) return null;
        return {
          id: session.id,
          name: session.name,
          points: session.points,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [sessionsToDisplay, sessions]);

  const handleRankingsComputed = useCallback((results: Result[], crossings: Map<string, { start?: Crossing; finish?: Crossing }>) => {
    onSetRankings(results);
    onSetCrossingsByBoat(crossings);
  }, [onSetRankings, onSetCrossingsByBoat]);

  // Get crossings for selected boat
  const selectedBoatCrossings = selectedBoatId ? crossingsByBoat.get(selectedBoatId) : null;

  return (
    <>
      <MapController onMapReady={onMapReady} currentTime={currentTime} />
      <MapClickHandler 
        activeTool={activeTool ?? null} 
        onRulerPointsChange={handleRulerPointsChange}
        gateDrawMode={gateDrawMode}
        onGatePoint={handleGatePoint}
      />
      <GateRankingCalculator
        gateStart={gateStart}
        gateFinish={gateFinish}
        boats={boatsForRanking}
        onRankingsComputed={handleRankingsComputed}
      />
      <FitBounds bounds={bounds} enabled={true} />
      
      {/* Gate visualization */}
      {gateStart && (
        <Polyline
          positions={[[gateStart.a.lat, gateStart.a.lon], [gateStart.b.lat, gateStart.b.lon]]}
          pathOptions={{
            color: '#10b981',
            weight: 4,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}
      {gateFinish && (
        <Polyline
          positions={[[gateFinish.a.lat, gateFinish.a.lon], [gateFinish.b.lat, gateFinish.b.lon]]}
          pathOptions={{
            color: '#ef4444',
            weight: 4,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}
      {/* Partial gate drawing (first point set, waiting for second) */}
      {gateStartPartial && gateDrawMode === 'drawStart' && (
        <Marker position={[gateStartPartial.lat, gateStartPartial.lon]}>
          <Tooltip permanent={true} direction="top">
            <div className="text-xs font-semibold">Point 1 - Cliquez pour point 2</div>
          </Tooltip>
        </Marker>
      )}
      {gateFinishPartial && gateDrawMode === 'drawFinish' && (
        <Marker position={[gateFinishPartial.lat, gateFinishPartial.lon]}>
          <Tooltip permanent={true} direction="top">
            <div className="text-xs font-semibold">Point 1 - Cliquez pour point 2</div>
          </Tooltip>
        </Marker>
      )}
      {/* Crossing markers for selected boat */}
      {selectedBoatCrossings && (
        <>
          {selectedBoatCrossings.start && (
            <Marker position={[selectedBoatCrossings.start.lat, selectedBoatCrossings.start.lon]}>
              <Tooltip permanent={true} direction="top">
                <div className="text-xs font-semibold text-green-600">Start</div>
                <div className="text-xs">{formatTime(selectedBoatCrossings.start.t)}</div>
              </Tooltip>
            </Marker>
          )}
          {selectedBoatCrossings.finish && (
            <Marker position={[selectedBoatCrossings.finish.lat, selectedBoatCrossings.finish.lon]}>
              <Tooltip permanent={true} direction="top">
                <div className="text-xs font-semibold text-red-600">Finish</div>
                <div className="text-xs">{formatTime(selectedBoatCrossings.finish.t)}</div>
              </Tooltip>
            </Marker>
          )}
        </>
      )}

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
                name={session.name}
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
  isGateRankingOpen?: boolean;
  gateStart: Gate | null;
  gateFinish: Gate | null;
  gateDrawMode: 'none' | 'drawStart' | 'drawFinish';
  gateStartPartial: { lat: number; lon: number } | null;
  gateFinishPartial: { lat: number; lon: number } | null;
  rankings: Result[];
  crossingsByBoat: Map<string, { start?: Crossing; finish?: Crossing }>;
  selectedBoatId: string | null;
  onSetGateStart: (gate: Gate | null) => void;
  onSetGateFinish: (gate: Gate | null) => void;
  onSetGateDrawMode: (mode: 'none' | 'drawStart' | 'drawFinish') => void;
  onSetGateStartPartial: (point: { lat: number; lon: number } | null) => void;
  onSetGateFinishPartial: (point: { lat: number; lon: number } | null) => void;
  onSetRankings: (rankings: Result[]) => void;
  onSetCrossingsByBoat: (crossings: Map<string, { start?: Crossing; finish?: Crossing }>) => void;
  onSetSelectedBoatId: (boatId: string | null) => void;
}

export function ReplayMap({ 
  currentTime, 
  onMapReady, 
  activeTool, 
  isGateRankingOpen,
  gateStart,
  gateFinish,
  gateDrawMode,
  gateStartPartial,
  gateFinishPartial,
  rankings,
  crossingsByBoat,
  selectedBoatId,
  onSetGateStart,
  onSetGateFinish,
  onSetGateDrawMode,
  onSetGateStartPartial,
  onSetGateFinishPartial,
  onSetRankings,
  onSetCrossingsByBoat,
  onSetSelectedBoatId,
}: ReplayMapProps) {
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
      <ReplayMapContent 
        currentTime={currentTime} 
        onMapReady={onMapReady} 
        activeTool={activeTool} 
        isGateRankingOpen={isGateRankingOpen}
        gateStart={gateStart}
        gateFinish={gateFinish}
        gateDrawMode={gateDrawMode}
        gateStartPartial={gateStartPartial}
        gateFinishPartial={gateFinishPartial}
        rankings={rankings}
        crossingsByBoat={crossingsByBoat}
        selectedBoatId={selectedBoatId}
        onSetGateStart={onSetGateStart}
        onSetGateFinish={onSetGateFinish}
        onSetGateDrawMode={onSetGateDrawMode}
        onSetGateStartPartial={onSetGateStartPartial}
        onSetGateFinishPartial={onSetGateFinishPartial}
        onSetRankings={onSetRankings}
        onSetCrossingsByBoat={onSetCrossingsByBoat}
        onSetSelectedBoatId={onSetSelectedBoatId}
      />
    </MapContainer>
  );
}

// Export wrapper (data loading is now handled by useEventTelemetry)
interface ReplayMapWithDataProps {
  currentTime: number;
  onMapReady?: (centerOnBoat: (sessionId: string, currentTime: number) => void) => void;
  activeTool?: string | null;
  isGateRankingOpen?: boolean;
  gateStart: Gate | null;
  gateFinish: Gate | null;
  gateDrawMode: 'none' | 'drawStart' | 'drawFinish';
  gateStartPartial: { lat: number; lon: number } | null;
  gateFinishPartial: { lat: number; lon: number } | null;
  rankings: Result[];
  crossingsByBoat: Map<string, { start?: Crossing; finish?: Crossing }>;
  selectedBoatId: string | null;
  onSetGateStart: (gate: Gate | null) => void;
  onSetGateFinish: (gate: Gate | null) => void;
  onSetGateDrawMode: (mode: 'none' | 'drawStart' | 'drawFinish') => void;
  onSetGateStartPartial: (point: { lat: number; lon: number } | null) => void;
  onSetGateFinishPartial: (point: { lat: number; lon: number } | null) => void;
  onSetRankings: (rankings: Result[]) => void;
  onSetCrossingsByBoat: (crossings: Map<string, { start?: Crossing; finish?: Crossing }>) => void;
  onSetSelectedBoatId: (boatId: string | null) => void;
}

export function ReplayMapWithData({ 
  currentTime, 
  onMapReady, 
  activeTool, 
  isGateRankingOpen,
  gateStart,
  gateFinish,
  gateDrawMode,
  gateStartPartial,
  gateFinishPartial,
  rankings,
  crossingsByBoat,
  selectedBoatId,
  onSetGateStart,
  onSetGateFinish,
  onSetGateDrawMode,
  onSetGateStartPartial,
  onSetGateFinishPartial,
  onSetRankings,
  onSetCrossingsByBoat,
  onSetSelectedBoatId,
}: ReplayMapWithDataProps) {
  return (
    <ReplayMap 
      currentTime={currentTime} 
      onMapReady={onMapReady} 
      activeTool={activeTool} 
      isGateRankingOpen={isGateRankingOpen}
      gateStart={gateStart}
      gateFinish={gateFinish}
      gateDrawMode={gateDrawMode}
      gateStartPartial={gateStartPartial}
      gateFinishPartial={gateFinishPartial}
      rankings={rankings}
      crossingsByBoat={crossingsByBoat}
      selectedBoatId={selectedBoatId}
      onSetGateStart={onSetGateStart}
      onSetGateFinish={onSetGateFinish}
      onSetGateDrawMode={onSetGateDrawMode}
      onSetGateStartPartial={onSetGateStartPartial}
      onSetGateFinishPartial={onSetGateFinishPartial}
      onSetRankings={onSetRankings}
      onSetCrossingsByBoat={onSetCrossingsByBoat}
      onSetSelectedBoatId={onSetSelectedBoatId}
    />
  );
}

