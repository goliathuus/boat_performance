import { useEffect, useState, useMemo, memo } from 'react';
import type { BoatTrack } from '@/domain/types';
import { interpolatePosition } from '@/domain/tracks';
import { parsePolarFile, groupPolarDataByTWS, type PolarCurve } from '@/domain/parsing/polar';

interface PolarChartProps {
  boats: BoatTrack[];
  currentTime: number | null;
  size?: number; // Dynamic size
}

export const PolarChart = memo(function PolarChart({ boats, currentTime, size = 280 }: PolarChartProps) {
  const POLAR_CHART_SIZE = size;
  const POLAR_CHART_RADIUS = POLAR_CHART_SIZE / 2 - 20; // Inner radius for chart
  const [polarCurves, setPolarCurves] = useState<PolarCurve[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCurves, setVisibleCurves] = useState<Set<number>>(new Set()); // Track which TWS curves are visible

  // Load and parse polar file
  useEffect(() => {
    const loadPolarFile = async () => {
      try {
        setLoading(true);
        const response = await fetch('/VECTOR 6.50.pol');
        if (!response.ok) {
          throw new Error(`Failed to load polar file: ${response.statusText}`);
        }
        const content = await response.text();
        const polarData = parsePolarFile(content);
        const curves = groupPolarDataByTWS(polarData);
        setPolarCurves(curves);
        // Initialize all curves as visible
        setVisibleCurves(new Set(curves.map((curve) => curve.tws)));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load polar file');
        console.error('Error loading polar file:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPolarFile();
  }, []);

  // Toggle curve visibility
  const toggleCurve = (tws: number) => {
    setVisibleCurves((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tws)) {
        newSet.delete(tws);
      } else {
        newSet.add(tws);
      }
      return newSet;
    });
  };

  // Get current boat positions (SOG, TWA)
  const boatPositions = useMemo(() => {
    if (currentTime === null) return [];

    return boats
      .map((boat) => {
        const pos = interpolatePosition(boat, currentTime);
        if (!pos || !pos.point) return null;

        const sog = pos.point.sog;
        const twa = pos.point.twa;

        if (sog === undefined || sog === null || twa === undefined || twa === null) {
          return null;
        }

        return {
          boat,
          sog,
          twa,
        };
      })
      .filter((pos): pos is NonNullable<typeof pos> => pos !== null);
  }, [boats, currentTime]);

  // Calculate max SOG for scaling
  const maxSOG = useMemo(() => {
    let max = 15; // Default max

    // Check polar curves
    for (const curve of polarCurves) {
      for (const point of curve.points) {
        max = Math.max(max, point.sog);
      }
    }

    // Check boat positions
    for (const pos of boatPositions) {
      max = Math.max(max, pos.sog);
    }

    return max;
  }, [polarCurves, boatPositions]);

  // Convert polar to cartesian coordinates
  const polarToCartesian = (radius: number, angle: number) => {
    // Angle in degrees, 0° = North (up)
    const rad = (angle * Math.PI) / 180;
    const x = POLAR_CHART_SIZE / 2 + Math.sin(rad) * radius;
    const y = POLAR_CHART_SIZE / 2 - Math.cos(rad) * radius;
    return [x, y];
  };

  // Normalize SOG to radius
  const normalizeSOG = (sog: number): number => {
    return (sog / maxSOG) * POLAR_CHART_RADIUS;
  };

  // Generate path for a polar curve (interpolated to 360 degrees with symmetry)
  const generateCurvePath = (curve: PolarCurve): string => {
    if (curve.points.length === 0) return '';

    // Sort points by TWA
    const sortedPoints = [...curve.points].sort((a, b) => a.twa - b.twa);

    // Get points from 0 to 180 degrees
    const points0to180 = sortedPoints.filter((p) => p.twa <= 180);

    if (points0to180.length === 0) return '';

    // Generate path for 0 to 180 degrees
    const pathPoints0to180: string[] = [];
    for (let i = 0; i < points0to180.length; i++) {
      const point = points0to180[i];
      const radius = normalizeSOG(point.sog);
      const [x, y] = polarToCartesian(radius, point.twa);
      pathPoints0to180.push(`${x},${y}`);
    }

    // Generate path for 180 to 360 degrees (mirror of 180 to 0)
    // For angle θ from 180 to 360, use the SOG value at angle (360 - θ)
    const pathPoints180to360: string[] = [];
    for (let i = points0to180.length - 1; i >= 0; i--) {
      const point = points0to180[i];
      const mirroredTwa = 360 - point.twa; // Mirror angle: 180 -> 180, 0 -> 360
      const radius = normalizeSOG(point.sog); // Same SOG value
      const [x, y] = polarToCartesian(radius, mirroredTwa);
      pathPoints180to360.push(`${x},${y}`);
    }

    // Combine paths
    const allPathPoints = [...pathPoints0to180, ...pathPoints180to360];

    return `M ${allPathPoints.join(' L ')} Z`;
  };

  // Generate color for TWS curve
  const getTWSColor = (tws: number): string => {
    // Generate a color gradient based on TWS
    const hue = (tws / 30) * 240; // Blue to red gradient
    return `hsl(${hue}, 70%, 50%)`;
  };

  if (loading) {
    return (
      <div className="p-3">
        <div className="flex items-center justify-center h-[240px] text-xs text-muted-foreground">
          Loading polar data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3">
        <div className="flex items-center justify-center h-[240px] text-xs text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 pt-0">
      <svg
        width={POLAR_CHART_SIZE}
        height={POLAR_CHART_SIZE}
        viewBox={`0 0 ${POLAR_CHART_SIZE} ${POLAR_CHART_SIZE}`}
        className="overflow-visible"
      >
        {/* Cross axes (X and Y) */}
        <g>
          {/* Horizontal axis (X) */}
          <line
            x1={POLAR_CHART_SIZE / 2 - POLAR_CHART_RADIUS}
            y1={POLAR_CHART_SIZE / 2}
            x2={POLAR_CHART_SIZE / 2 + POLAR_CHART_RADIUS}
            y2={POLAR_CHART_SIZE / 2}
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-border opacity-40"
          />
          {/* Vertical axis (Y) */}
          <line
            x1={POLAR_CHART_SIZE / 2}
            y1={POLAR_CHART_SIZE / 2 - POLAR_CHART_RADIUS}
            x2={POLAR_CHART_SIZE / 2}
            y2={POLAR_CHART_SIZE / 2 + POLAR_CHART_RADIUS}
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-border opacity-40"
          />
        </g>

        {/* Speed circles with scale labels */}
        {[3, 6, 9, 12].map((sog) => {
          if (sog > maxSOG) return null;
          const radius = normalizeSOG(sog);
          return (
            <g key={`speed-circle-${sog}`}>
              <circle
                cx={POLAR_CHART_SIZE / 2}
                cy={POLAR_CHART_SIZE / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-border opacity-30"
              />
              {/* Speed label on the vertical axis (0° = North, top) */}
              <text
                x={POLAR_CHART_SIZE / 2}
                y={POLAR_CHART_SIZE / 2 - radius - 8}
                textAnchor="middle"
                dominantBaseline="bottom"
                fontSize="9"
                className="fill-muted-foreground"
              >
                {sog}kn
              </text>
            </g>
          );
        })}

        {/* Additional grid lines for angles (lighter, every 30 degrees) */}
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const endX = POLAR_CHART_SIZE / 2 + Math.sin(rad) * POLAR_CHART_RADIUS;
          const endY = POLAR_CHART_SIZE / 2 - Math.cos(rad) * POLAR_CHART_RADIUS;
          return (
            <line
              key={`grid-line-${angle}`}
              x1={POLAR_CHART_SIZE / 2}
              y1={POLAR_CHART_SIZE / 2}
              x2={endX}
              y2={endY}
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-border opacity-15"
            />
          );
        })}

        {/* Cardinal directions */}
        {[
          { dir: 'N', angle: 0 },
          { dir: 'E', angle: 90 },
          { dir: 'S', angle: 180 },
          { dir: 'W', angle: 270 },
        ].map(({ dir, angle }) => {
          const rad = (angle * Math.PI) / 180;
          const x = POLAR_CHART_SIZE / 2 + Math.sin(rad) * (POLAR_CHART_RADIUS + 10);
          const y = POLAR_CHART_SIZE / 2 - Math.cos(rad) * (POLAR_CHART_RADIUS + 10);
          return (
            <text
              key={`cardinal-${dir}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-xs fill-muted-foreground"
              fontSize="10"
            >
              {dir}
            </text>
          );
        })}

        {/* Theoretical polar curves for each TWS */}
        {polarCurves.map((curve) => {
          const path = generateCurvePath(curve);
          if (!path) return null;
          const isVisible = visibleCurves.has(curve.tws);

          return (
            <path
              key={`curve-${curve.tws}`}
              d={path}
              fill="none"
              stroke={getTWSColor(curve.tws)}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isVisible ? 0.6 : 0}
              style={{ cursor: 'pointer' }}
            />
          );
        })}

        {/* Boat positions */}
        {boatPositions.map(({ boat, sog, twa }) => {
          const radius = normalizeSOG(sog);
          const [x, y] = polarToCartesian(radius, twa);

          return (
            <g key={boat.id}>
              {/* White outline for visibility */}
              <circle
                cx={x}
                cy={y}
                r="4"
                fill="white"
                stroke="white"
                strokeWidth="0.5"
                opacity="0.8"
              />
              {/* Boat point (smaller) */}
              <circle
                cx={x}
                cy={y}
                r="2.5"
                fill={boat.color}
                stroke={boat.color}
                strokeWidth="0.5"
                opacity="1"
              />
            </g>
          );
        })}
      </svg>

      {/* Legend for theoretical curves */}
      <div className="flex flex-wrap gap-1.5 justify-center mt-1">
        {polarCurves
          .sort((a, b) => a.tws - b.tws) // Sort by TWS value
          .map((curve) => {
            const isVisible = visibleCurves.has(curve.tws);
            return (
              <div
                key={`legend-tws-${curve.tws}`}
                className="flex items-center gap-1 text-[10px] cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => toggleCurve(curve.tws)}
                style={{ opacity: isVisible ? 1 : 0.4 }}
              >
                <div
                  className="w-3 h-0.5 shrink-0"
                  style={{ backgroundColor: getTWSColor(curve.tws), opacity: isVisible ? 0.6 : 0.3 }}
                />
                <span className="text-muted-foreground">{curve.tws} kts</span>
              </div>
            );
          })}
      </div>
    </div>
  );
});

