import { useEffect, useRef, useMemo, memo, useCallback, useState, Fragment } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Tooltip,
  Popup,
  Pane,
  useMap,
  useMapEvents,
} from 'react-leaflet';
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
import { computeBounds, sampleTrackAt } from '@/domain/tracks';

// References stables : un tableau vide neuf a chaque image relancerait les effets.
const EMPTY_POSITIONS: Array<[number, number]> = [];
// Styles de trace mis en cache : un objet neuf a chaque image ferait reappliquer
// le style par Leaflet sur toute la trace.
const trackStyleCache = new Map<string, { casing: L.PathOptions; line: L.PathOptions }>();
function trackStyles(color: string, focused: boolean) {
  const key = `${color}|${focused}`;
  let styles = trackStyleCache.get(key);
  if (!styles) {
    styles = {
      casing: { color: '#07090d', weight: focused ? 6 : 4, opacity: 0.55, lineCap: 'round', lineJoin: 'round' },
      line: { color, weight: focused ? 3 : 2, opacity: focused ? 1 : 0.92, lineCap: 'round', lineJoin: 'round' },
    };
    trackStyleCache.set(key, styles);
  }
  return styles;
}
const EMPTY_RANKING_BOATS: Array<{ id: string; name: string; points: TrackPoint[] }> = [];
import { formatTime } from '@/lib/time';
import { WindLayer } from '@/components/map/WindLayer';
import { WindLegend } from '@/components/map/WindLegend';
import { WindProbe } from '@/components/map/WindProbe';
import { useWindField } from '@/hooks/useWindField';
import type { WindModelId } from '@/lib/wind';

// Modele de vent choisi par ce visiteur (confort local, pas une donnee partagee).
const WIND_MODEL_STORAGE_KEY = 'boat-tracker:wind-model';

function readWindModelPref(): WindModelId | null {
  try {
    const v = localStorage.getItem(WIND_MODEL_STORAGE_KEY);
    return v === 'arome' || v === 'ecmwf' ? v : null;
  } catch {
    return null;
  }
}

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
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createBoatIcon(cog: number | undefined, boatColor: string, name: string): L.DivIcon {
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

  // Etiquette permanente : au-dela de trois bateaux la couleur ne suffit plus a
  // les distinguer sur la carte, c'est le nom qui porte l'identite. Chrome neutre
  // (verre fume, encre claire) pour ne pas concurrencer les traces ; la
  // pastille de couleur fait le lien avec la trace.
  const label = `
    <span style="
      position:absolute; left:27px; top:50%; transform:translateY(-50%);
      display:inline-flex; align-items:center; gap:5px;
      max-width:150px; padding:2px 7px 2px 5px;
      background:rgba(17,21,28,.82); border:1px solid rgba(255,255,255,.12);
      border-radius:999px; box-shadow:0 2px 6px rgba(0,0,0,.45);
      font:600 11px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif;
      letter-spacing:.01em; color:#eef2f7; white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis; pointer-events:none;
    ">
      <span style="width:6px;height:6px;border-radius:50%;background:${boatColor};flex:none;"></span>
      ${escapeHtml(name)}
    </span>
  `;

  return L.divIcon({
    className: 'boat-marker',
    html: `<div style="position:relative;width:24px;height:24px;">${svg}${label}</div>`,
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

function getBoatIcon(cog: number | undefined, color: string, name: string): L.DivIcon {
  // Cap arrondi a 2° : avec un cap interpole, une cle exacte ferait grossir le
  // cache sans fin et reconstruirait l'icone a chaque image.
  const rounded = cog === undefined ? undefined : (Math.round(cog / 2) * 2) % 360;
  const key = `${color}-${rounded ?? 'none'}-${name}`;
  if (!boatIconCache.has(key)) {
    boatIconCache.set(key, createBoatIcon(rounded, color, name));
  }
  return boatIconCache.get(key)!;
}

const BoatMarker = memo(function BoatMarker({ position, color, name, speed, cog, currentTime, sessionId, onFocus }: BoatMarkerProps) {
  if (!position) return null;

  const icon = getBoatIcon(cog ?? undefined, color, name);

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
        sog: p.sog,
        cog: p.cog,
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
  /** Affiche la couche de vent (champ colore + particules) et sa legende. */
  showWind?: boolean;
  /** Bascule du vent depuis la legende ; sans elle, la legende n'apparait qu'avec le vent. */
  onToggleWind?: () => void;
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
  const hiddenSessionIds = useReplayStore((state) => state.hiddenSessionIds);
  const focusSessionId = useReplayStore((state) => state.focusSessionId);
  const setFocusSession = useReplayStore((state) => state.setFocusSession);
  const sessions = useReplayStore((state) => state.sessions);
  const windowStartTime = useReplayStore((state) => state.windowStartTime);
  // En direct, un bateau reste a sa derniere position au-dela de son dernier point.
  const liveMode = useReplayStore((state) => state.liveMode);
  
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


  // Display only non-hidden sessions (even if they don't have points loaded yet).
  // This allows sessions to appear immediately while telemetry is loading.
  const sessionsToDisplay = useMemo(() => {
    return selectedSessionIds.filter((id) => !hiddenSessionIds.has(id));
  }, [selectedSessionIds, hiddenSessionIds]);

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

  // Temps arrondi a la seconde pour ce qui n'a pas besoin de suivre chaque
  // image : horodatage des bulles, classement aux portes.
  const throttledCurrentTime = Math.floor(currentTime / 1000) * 1000;

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

  // Positions de trace par bateau, reutilisees tant que la fenetre de points
  // [debut, dernier point passe] ne change pas : Leaflet ne redessine la trace
  // complete que lorsqu'un nouveau point GPS est franchi, pas a chaque image.
  const trackCacheRef = useRef(
    new Map<string, { points: TrackPoint[]; start: number; end: number; positions: Array<[number, number]> }>()
  );

  const mapElements = useMemo(() => {
    const cache = trackCacheRef.current;
    return sessionsToDisplay.map((sessionId) => {
      const session = sessions.get(sessionId);

      // If session doesn't exist in store yet, return minimal info (will show nothing but won't crash)
      if (!session) {
        return {
          sessionId,
          session: null,
          trackPositions: EMPTY_POSITIONS,
          headPositions: null,
          markerPosition: null,
          markerSpeed: null,
          markerCog: null,
          isFocused: false,
          isLoading: true,
        };
      }

      const isFocused = focusSessionId === sessionId;
      const points = session.points;

      // Position interpolee entre les deux points qui encadrent l'instant : le
      // bateau glisse d'un point GPS au suivant au lieu de sauter.
      const sample = points.length > 0 ? sampleTrackAt(points, currentTime) : null;

      let trackPositions = EMPTY_POSITIONS;
      let headPositions: Array<[number, number]> | null = null;
      const windowOk = windowStartTime === null || windowStartTime <= session.tMax;
      if (sample && windowOk) {
        const start =
          windowStartTime !== null && windowStartTime > session.tMin
            ? binarySearchStart(points, windowStartTime)
            : 0;
        const end = sample.index + 1; // exclusif
        if (end > start) {
          const hit = cache.get(sessionId);
          if (hit && hit.points === points && hit.start === start && hit.end === end) {
            trackPositions = hit.positions;
          } else {
            trackPositions = points.slice(start, end).map((p) => [p.lat, p.lon] as [number, number]);
            cache.set(sessionId, { points, start, end, positions: trackPositions });
          }
          // Segment de tete : du dernier point franchi jusqu'au bateau.
          const last = points[sample.index];
          if (last.lat !== sample.lat || last.lon !== sample.lon) {
            headPositions = [
              [last.lat, last.lon],
              [sample.lat, sample.lon],
            ];
          }
        }
      }

      // Le bateau n'est affiche que pendant sa session. En direct, il reste a
      // sa derniere position au-dela de son dernier point (reseau coupe, point
      // pas encore arrive) : sampleTrackAt renvoie alors ce dernier point.
      const onWater = sample !== null && (currentTime <= session.tMax || liveMode);

      return {
        sessionId,
        session,
        trackPositions,
        headPositions,
        markerPosition: onWater ? ([sample.lat, sample.lon] as [number, number]) : null,
        markerSpeed: onWater ? sample.sog : null,
        markerCog: onWater ? sample.cog : null,
        isFocused,
        isLoading: false,
      };
    });
  }, [sessionsToDisplay, sessions, currentTime, focusSessionId, windowStartTime, liveMode]);

  // Calculate distance for ruler tool
  const rulerDistance = useMemo(() => {
    if (rulerStart && rulerEnd) {
      return calculateDistance(rulerStart[0], rulerStart[1], rulerEnd[0], rulerEnd[1]);
    }
    return null;
  }, [rulerStart, rulerEnd]);

  // Prepare boats for ranking calculation - filter points by time window
  const boatsForRanking = useMemo(() => {
    if (!gateStart || !gateFinish) return EMPTY_RANKING_BOATS;
    return sessionsToDisplay
      .map((sessionId) => {
        const session = sessions.get(sessionId);
        if (!session || session.points.length === 0) return null;

        // Filter points to only include those between windowStartTime and currentTime
        let filteredPoints = session.points;
        if (windowStartTime !== null) {
          filteredPoints = session.points.filter(
            (p) => p.t >= windowStartTime && p.t <= throttledCurrentTime
          );
        } else {
          filteredPoints = session.points.filter((p) => p.t <= throttledCurrentTime);
        }

        if (filteredPoints.length === 0) return null;

        return {
          id: session.id,
          name: session.name,
          points: filteredPoints,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [gateStart, gateFinish, sessionsToDisplay, sessions, windowStartTime, throttledCurrentTime]);

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
      {mapElements.map(({ sessionId, session, trackPositions, headPositions, markerPosition, markerSpeed, markerCog, isFocused, isLoading }) => {
        // Skip rendering if session is still loading (no session data yet)
        if (isLoading || !session) {
          return null;
        }

        const { casing, line } = trackStyles(session.color, isFocused);

        return (
          <Fragment key={sessionId}>
            {/* Liseré sombre sous la trace : la detache du champ de vent colore. */}
            {trackPositions.length >= 2 && (
              <>
                <Polyline positions={trackPositions} interactive={false} pathOptions={casing} />
                <Polyline positions={trackPositions} pathOptions={line} />
              </>
            )}
            {/* Dernier troncon, du point franchi au bateau : seul redessine a chaque image. */}
            {headPositions && (
              <>
                <Polyline positions={headPositions} interactive={false} pathOptions={casing} />
                <Polyline positions={headPositions} interactive={false} pathOptions={line} />
              </>
            )}

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
          </Fragment>
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
  /** Affiche la couche de vent (champ colore + particules) et sa legende. */
  showWind?: boolean;
  /** Bascule du vent depuis la legende ; sans elle, la legende n'apparait qu'avec le vent. */
  onToggleWind?: () => void;
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
  showWind = false,
  onToggleWind,
}: ReplayMapProps) {
  const [windModelPref, setWindModelPref] = useState<WindModelId | null>(readWindModelPref);
  const wind = useWindField(showWind, currentTime, windModelPref);
  const selectWindModel = useCallback((model: WindModelId) => {
    setWindModelPref(model);
    try {
      localStorage.setItem(WIND_MODEL_STORAGE_KEY, model);
    } catch {
      /* stockage indisponible (navigation privee) : le choix vaut pour la session */
    }
  }, []);
  // Les clics sur la carte appartiennent d'abord aux outils actifs.
  const windProbeEnabled = !activeTool && gateDrawMode === 'none';

  return (
    <div className="relative h-full w-full">
    <MapContainer
      center={[46.0, -1.0]}
      zoom={10}
      maxZoom={19}
      // Zoom au pincement ou a la molette : les boutons +/- etaient de toute
      // facon masques par la barre d'outils de gauche.
      zoomControl={false}
      style={{ height: '100%', width: '100%' }}
      className="z-0"
    >
      <TileLayer
        attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin'
        url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxNativeZoom={16}
      />
      {/* Toponymes au-dessus du vent, sous les traces (overlayPane = 400). */}
      <Pane name="labels" style={{ zIndex: 350, pointerEvents: 'none' }}>
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          maxNativeZoom={16}
        />
      </Pane>
      {showWind && wind.grid && (
        <>
          <WindLayer grid={wind.grid} time={currentTime} />
          <WindProbe grid={wind.grid} time={currentTime} enabled={windProbeEnabled} />
        </>
      )}
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
    {(showWind || onToggleWind) && (
      <div className="absolute bottom-6 left-2 z-[900] sm:left-16">
        <WindLegend
          enabled={showWind}
          onToggleEnabled={onToggleWind}
          status={wind.status}
          model={wind.model}
          aromeAvailable={wind.aromeAvailable}
          onSelectModel={selectWindModel}
          grid={wind.grid}
          runInfo={wind.runInfo}
          currentTime={currentTime}
        />
      </div>
    )}
    </div>
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
  /** Affiche la couche de vent (champ colore + particules) et sa legende. */
  showWind?: boolean;
  /** Bascule du vent depuis la legende ; sans elle, la legende n'apparait qu'avec le vent. */
  onToggleWind?: () => void;
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
  showWind,
  onToggleWind,
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
      showWind={showWind}
      onToggleWind={onToggleWind}
    />
  );
}

