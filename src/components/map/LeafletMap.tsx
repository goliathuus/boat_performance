import { useEffect, useRef, useMemo, memo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Polygon,
  Marker,
  Popup,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { BoatTrack, TrackPoint } from '@/domain/types';
import {
  interpolatePosition,
  getPointsUntilTime,
  computeBounds,
  filterPointsByTimeRange,
  calculateDestPoint,
} from '@/domain/tracks';
import { formatTime } from '@/lib/time';
import { getSogColor } from '@/lib/color';
import { profiler } from '@/lib/performance';
import { HotlineTrack } from './HotlineTrack';

// Fix default marker icons for Leaflet
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
  const boundsRef = useRef<L.LatLngBounds | null>(null);

  useEffect(() => {
    // Check if bounds have changed significantly (new dataset)
    const boundsChanged =
      !boundsRef.current ||
      !bounds ||
      !boundsRef.current.equals(bounds) ||
      Math.abs(boundsRef.current.getNorth() - bounds.getNorth()) > 0.01 ||
      Math.abs(boundsRef.current.getSouth() - bounds.getSouth()) > 0.01;

    if (boundsChanged) {
      boundsRef.current = bounds;
      hasFittedRef.current = false;
    }

    if (enabled && bounds && !hasFittedRef.current) {
      map.fitBounds(bounds, { padding: [20, 20] });
      hasFittedRef.current = true;
    }
  }, [map, bounds, enabled]);

  return null;
}

interface FitBoundsTriggerProps {
  bounds: L.LatLngBounds | null;
}

function FitBoundsTrigger({ bounds }: FitBoundsTriggerProps) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, bounds]);
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

/**
 * TWD Arrow component - draws arrow from outside pointing towards boat
 * Arrow starts from TWD + 180° direction (wind direction) and points towards boat
 * Size: 24px (same as boat icon)
 */
interface TWDArrowProps {
  boatPos: [number, number];
  twd: number;
  boatColor: string;
}

function TWDArrow({ boatPos, twd, boatColor }: TWDArrowProps) {
  const map = useMap();
  const boatIconSizePx = 24; // Same as boat icon size

  // Calculate distance in meters for pixels at current zoom level using Leaflet
  const getDistanceInMeters = (pixels: number): number => {
    const center = L.latLng(boatPos[0], boatPos[1]);
    const point1 = map.latLngToContainerPoint(center);
    // Calculate a point that is 'pixels' pixels away in the Y direction
    const point2 = L.point(point1.x, point1.y + pixels);
    const latLng2 = map.containerPointToLatLng(point2);
    return center.distanceTo(latLng2);
  };

  // Increase spacing for better visibility
  const arrowSpacingMeters = getDistanceInMeters(boatIconSizePx * 1.5); // Distance from boat to arrowhead
  const arrowWidthMeters = getDistanceInMeters(boatIconSizePx * 0.4); // Arrowhead width
  const arrowheadLengthMeters = getDistanceInMeters(boatIconSizePx * 0.3); // Arrowhead size

  // TWD = direction from which wind comes (0° = North)
  // Flèche part de l'extérieur dans la direction TWD (d'où vient le vent)
  // et pointe vers le bateau pour montrer d'où vient le vent
  
  // Point de départ (pointe du triangle): à l'extérieur dans la direction TWD
  // C'est la direction d'où vient le vent
  const windDirection = twd; // Direction d'où vient le vent
  const [tipLat, tipLon] = calculateDestPoint(boatPos[0], boatPos[1], windDirection, arrowSpacingMeters);

  // Point d'arrivée: au centre du bateau (boatPos) - le trait s'arrête au centre
  const [endLat, endLon] = boatPos;

  // Direction de la flèche: de la pointe vers le bateau (direction opposée à TWD)
  const arrowDirection = (twd + 180) % 360; // Direction vers le bateau

  // Calculer la base du triangle (reculer de la pointe dans la direction opposée)
  const [arrowBaseLat, arrowBaseLon] = calculateDestPoint(
    tipLat,
    tipLon,
    windDirection, // On recule de la pointe dans la même direction (TWD)
    arrowheadLengthMeters
  );

  // Calculer les points de la base du triangle (perpendiculaires à la direction de la flèche)
  const perpBearing1 = (arrowDirection + 90) % 360;
  const perpBearing2 = (arrowDirection - 90 + 360) % 360;
  const [arrowLeftLat, arrowLeftLon] = calculateDestPoint(
    arrowBaseLat,
    arrowBaseLon,
    perpBearing1,
    arrowWidthMeters
  );
  const [arrowRightLat, arrowRightLon] = calculateDestPoint(
    arrowBaseLat,
    arrowBaseLon,
    perpBearing2,
    arrowWidthMeters
  );

  // Calculer la position du texte TWD (juste au-dessus du triangle)
  // Le texte est positionné dans la même direction que le triangle (windDirection)
  // mais un peu plus loin du bateau
  const textSpacingMeters = getDistanceInMeters(boatIconSizePx * 0.5); // Espacement au-dessus du triangle
  const [textLat, textLon] = calculateDestPoint(
    tipLat,
    tipLon,
    windDirection, // Même direction que le triangle (TWD)
    textSpacingMeters
  );

  // Créer l'icône pour le texte TWD
  const twdTextIcon = L.divIcon({
    className: 'twd-text-label',
    html: `<div style="
      color: ${boatColor};
      font-weight: bold;
      font-size: 12px;
      text-align: center;
      text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.8), -1px -1px 2px rgba(255, 255, 255, 0.8);
      white-space: nowrap;
    ">${twd.toFixed(0)}°</div>`,
    iconSize: [40, 20],
    iconAnchor: [20, 10],
  });

  return (
    <>
      {/* Main arrow line (from triangle tip to boat center) */}
      <Polyline
        positions={[
          [tipLat, tipLon], // Start from triangle tip
          [endLat, endLon], // End at boat center
        ]}
        pathOptions={{
          color: boatColor,
          weight: 2,
          opacity: 0.5,
        }}
      />
      {/* Arrowhead triangle (positioned away from boat, pointing towards boat) */}
      <Polygon
        positions={[
          [tipLat, tipLon], // Tip of triangle (pointing towards boat)
          [arrowLeftLat, arrowLeftLon], // Left base point
          [arrowRightLat, arrowRightLon], // Right base point
        ]}
        pathOptions={{
          color: boatColor,
          weight: 1,
          opacity: 0.5,
          fillColor: boatColor,
          fillOpacity: 0.5,
        }}
      />
      {/* TWD value text label above triangle */}
      <Marker
        position={[textLat, textLon]}
        icon={twdTextIcon}
      />
    </>
  );
}

/**
 * Boat Track Renderer Component - optimized with memo
 */
interface BoatTrackRendererProps {
  boat: BoatTrack;
  drawFullTrack: boolean;
  currentTime: number | null;
  timeRange: [number, number] | null;
  sogRange: { min: number; max: number };
  showTWD: boolean;
}

const BoatTrackRenderer = memo(function BoatTrackRenderer({
  boat,
  drawFullTrack,
  currentTime,
  timeRange,
  sogRange,
  showTWD,
}: BoatTrackRendererProps) {
  // Calculate points to draw
  const pointsToDraw = useMemo(() => {
    if (timeRange) {
      return drawFullTrack
        ? boat.points
        : currentTime !== null
          ? getPointsUntilTime(boat, currentTime)
          : [];
    } else {
      return drawFullTrack
        ? boat.points
        : currentTime !== null
          ? getPointsUntilTime(boat, currentTime)
          : [];
    }
  }, [boat, drawFullTrack, currentTime, timeRange]);

  // Prepare positions for HotlineTrack: [lat, lon, sog]
  // Use hotline for gradient color instead of multiple Polyline components
  // Memoized with stable dependencies - pointsToDraw is already memoized above
  const hotlinePositions = useMemo(() => {
    return profiler.measure(
      'calculateSegments',
      () => {
        if (pointsToDraw.length < 2) {
          console.log('[BoatTrackRenderer] Not enough points to draw:', pointsToDraw.length);
          return [];
        }
        
        // Decimate if necessary for performance
        const decimationFactor = pointsToDraw.length > 1000 ? 2 : 1;
        const positions: Array<[number, number, number]> = [];
        
        for (let i = 0; i < pointsToDraw.length; i += decimationFactor) {
          const p = pointsToDraw[i];
          // Use SOG value for color gradient, fallback to 0 if undefined
          const sog = p.sog !== undefined ? p.sog : 0;
          positions.push([p.lat, p.lon, sog]);
        }
        
        console.log('[BoatTrackRenderer] Prepared hotline positions:', {
          boatId: boat.id,
          boatName: boat.name,
          positionsCount: positions.length,
          pointsToDrawCount: pointsToDraw.length,
          decimationFactor,
          firstPosition: positions[0],
          lastPosition: positions[positions.length - 1],
          sogRange: {
            min: Math.min(...positions.map(p => p[2])),
            max: Math.max(...positions.map(p => p[2])),
          },
        });
        
        // Record metric
        if (profiler.isEnabled()) {
          profiler.recordMetric('calculateSegments', 0, positions.length, pointsToDraw.length);
        }
        
        return positions;
      },
      pointsToDraw.length,
      boat.points.length
    );
  }, [pointsToDraw, boat.id, boat.name]); // pointsToDraw is already memoized, so this is stable

  // Interpolate current position
  const currentPos = useMemo(() => {
    if (currentTime === null) return null;
    return interpolatePosition(boat, currentTime);
  }, [boat, currentTime]);

  // Track render time
  useEffect(() => {
    if (!profiler.isEnabled()) return;
    const renderStart = performance.now();
    return () => {
      const renderEnd = performance.now();
      profiler.recordMetric('renderBoatTrack', renderEnd - renderStart, hotlinePositions.length, boat.points.length);
    };
  }, [boat.id, boat.points.length, hotlinePositions.length]);

  return (
    <>
      {/* Hotline track with gradient color based on SOG */}
      {hotlinePositions.length >= 2 && (
        <>
          {console.log('[BoatTrackRenderer] Rendering HotlineTrack', {
            boatId: boat.id,
            positionsCount: hotlinePositions.length,
            min: sogRange.min,
            max: sogRange.max,
          })}
          <HotlineTrack
            positions={hotlinePositions}
            min={sogRange.min}
            max={sogRange.max}
            weight={2}
          />
        </>
      )}

      {/* TWD Arrow */}
      {showTWD && currentPos && currentPos.point?.twd !== undefined && (
        <TWDArrow
          boatPos={[currentPos.lat, currentPos.lon]}
          twd={currentPos.point.twd}
          boatColor={boat.color}
        />
      )}

      {/* Marker at current position */}
      {currentPos && (
        <Marker
          position={[currentPos.lat, currentPos.lon]}
          icon={createBoatIcon(currentPos.point?.cog, boat.color)}
        >
          <Tooltip permanent={false} direction="top" offset={[0, -12]}>
            <div className="text-xs">
              <div className="font-semibold">{boat.name}</div>
              {currentPos.point?.sog !== undefined && (
                <div>SOG: {currentPos.point.sog.toFixed(1)} kn</div>
              )}
              {currentPos.point?.cog !== undefined && (
                <div>COG: {currentPos.point.cog.toFixed(1)}°</div>
              )}
              {currentPos.point?.twd !== undefined && (
                <div>TWD: {currentPos.point.twd.toFixed(1)}°</div>
              )}
              {currentTime && <div>{formatTime(currentTime)}</div>}
            </div>
          </Tooltip>
          <Popup>
            <div className="p-2">
              <div className="font-semibold">{boat.name}</div>
              <div className="text-sm text-muted-foreground">
                Time: {currentTime ? formatTime(currentTime) : 'N/A'}
              </div>
              {currentPos.point?.sog !== undefined && (
                <div className="text-sm">SOG: {currentPos.point.sog.toFixed(1)} kn</div>
              )}
              {currentPos.point?.cog !== undefined && (
                <div className="text-sm">COG: {currentPos.point.cog.toFixed(1)}°</div>
              )}
              {currentPos.point?.twd !== undefined && (
                <div className="text-sm">TWD: {currentPos.point.twd.toFixed(1)}°</div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                {currentPos.lat.toFixed(6)}, {currentPos.lon.toFixed(6)}
              </div>
            </div>
          </Popup>
        </Marker>
      )}
    </>
  );
});

/**
 * Get SOG range for color normalization
 * Fixed range: 0-15 knots for consistent color scale
 */
function getSogRange(boats: BoatTrack[]): { min: number; max: number } {
  // Fixed range for consistent color scale across all tracks
  return { min: 0, max: 15 };
}

interface LeafletMapProps {
  boats: BoatTrack[];
  currentTime: number | null;
  drawFullTrack: boolean;
  zoomToBounds?: L.LatLngBounds | null;
  timeRange?: [number, number] | null;
  autoFitEnabled?: boolean;
  showTWD?: boolean;
}

export function LeafletMap({
  boats,
  currentTime,
  drawFullTrack,
  zoomToBounds,
  timeRange,
  autoFitEnabled = true,
  showTWD = false,
}: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Filter boats by time range if specified
  const filteredBoats = useMemo(() => {
    if (!timeRange) return boats;
    return boats.map((boat) => filterPointsByTimeRange(boat, timeRange));
  }, [boats, timeRange]);

  // Compute SOG range for color normalization
  const sogRange = useMemo(() => getSogRange(filteredBoats), [filteredBoats]);

  // Compute bounds for all boats
  const bounds = useMemo(() => computeBounds(filteredBoats), [filteredBoats]);

  // Carto Positron tile layer (clean, light style similar to Windy)
  const tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  const attribution =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

  return (
    <div className="w-full h-full">
      <MapContainer
        center={[46.15, -1.24]}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
        zoomControl={true}
      >
        <TileLayer url={tileUrl} attribution={attribution} />
        <FitBounds bounds={bounds} enabled={autoFitEnabled} />
        {zoomToBounds && <FitBoundsTrigger bounds={zoomToBounds} />}

        {filteredBoats.map((boat) => (
          <BoatTrackRenderer
            key={boat.id}
            boat={boat}
            drawFullTrack={drawFullTrack}
            currentTime={currentTime}
            timeRange={timeRange}
            sogRange={sogRange}
            showTWD={showTWD}
          />
        ))}

      </MapContainer>
    </div>
  );
}
