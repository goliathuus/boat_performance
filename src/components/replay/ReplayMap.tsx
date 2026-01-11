import { useEffect, useRef, useMemo, memo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, Popup, useMap } from 'react-leaflet';
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

const BoatMarker = memo(function BoatMarker({ position, color, name, speed, cog, currentTime }: BoatMarkerProps) {
  if (!position) return null;

  const icon = getBoatIcon(cog ?? undefined, color);

  return (
    <Marker position={position} icon={icon}>
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

// Memoized component to prevent unnecessary re-renders
const ReplayMapContent = memo(function ReplayMapContent() {
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const focusSessionId = useReplayStore((state) => state.focusSessionId);
  const sessions = useReplayStore((state) => state.sessions);
  const currentTime = useReplayStore((state) => state.currentTime);


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

      // Progressive track: ALL points up to currentTime (entire past track)
      // If currentTime is null, show full track (all points)
      // Optimized: use binary search to find cutoff point instead of filtering all points
      let progressiveTrackPositions: Array<[number, number]> = [];
      let endIndex: number | 'all' = 'all';
      if (session.points.length > 0) {
        // If currentTime is null, show all points (full track)
        // Otherwise, show points up to currentTime
        if (throttledCurrentTime === null) {
          // Show full track when currentTime is not set yet
          progressiveTrackPositions = session.points.map((p) => [p.lat, p.lon] as [number, number]);
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
          
          // Use slice instead of filter - much faster for large arrays
          progressiveTrackPositions = session.points
            .slice(0, endIndex)
            .map((p) => [p.lat, p.lon] as [number, number]);
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
  }, [sessionsToDisplay, sessions, throttledCurrentTime, focusSessionId]);

  return (
    <>
      <FitBounds bounds={bounds} enabled={true} />

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
                    weight: isFocused ? 5 : 3,
                    opacity: isFocused ? 1.0 : 0.8,
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
              />
            )}
          </div>
        );
      })}
    </>
  );
});

export function ReplayMap() {
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
      <ReplayMapContent />
    </MapContainer>
  );
}

// Export wrapper (data loading is now handled by useEventTelemetry)
export function ReplayMapWithData() {
  return <ReplayMap />;
}

