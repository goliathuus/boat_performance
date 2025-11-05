import { useMemo, memo } from 'react';
import type { BoatTrack } from '@/domain/types';
import { Button } from '@/components/ui/button';

interface TimeSeriesGraphProps {
  boats: BoatTrack[];
  currentTime: number | null;
  timeRangeMinutes: number; // 1, 2, 5, or 10 minutes
  height?: number; // Dynamic height
}

const GRAPH_PADDING = { top: 20, right: 10, bottom: 30, left: 40 };

export const TimeSeriesGraph = memo(function TimeSeriesGraph({
  boats,
  currentTime,
  timeRangeMinutes,
  height = 150,
}: TimeSeriesGraphProps) {
  const GRAPH_HEIGHT = height;
  // Filter points centered around currentTime
  const graphData = useMemo(() => {
    if (currentTime === null || boats.length === 0) return [];

    const timeWindow = timeRangeMinutes * 60 * 1000; // Convert minutes to ms
    const halfWindow = timeWindow / 2;
    const startTime = currentTime - halfWindow;
    const endTime = currentTime + halfWindow;

    return boats.map((boat) => {
      const points = boat.points
        .filter((p) => p.t >= startTime && p.t <= endTime && p.sog !== undefined)
        .map((p) => ({
          time: p.t,
          sog: p.sog!,
        }));

      return {
        boat,
        points,
      };
    });
  }, [boats, currentTime, timeRangeMinutes]);

  // Calculate SOG range for Y-axis
  const sogRange = useMemo(() => {
    let min = 0;
    let max = 15;

    for (const { points } of graphData) {
      for (const point of points) {
        if (point.sog !== null && point.sog !== undefined) {
          min = Math.min(min, point.sog);
          max = Math.max(max, point.sog);
        }
      }
    }

    // Add padding to range
    const padding = (max - min) * 0.1;
    return {
      min: Math.max(0, min - padding),
      max: Math.min(15, max + padding),
    };
  }, [graphData]);

  // Calculate time range for X-axis (centered around currentTime)
  const timeRange = useMemo(() => {
    if (currentTime === null) return { min: 0, max: 0 };

    const timeWindow = timeRangeMinutes * 60 * 1000;
    const halfWindow = timeWindow / 2;
    return {
      min: currentTime - halfWindow,
      max: currentTime + halfWindow,
    };
  }, [currentTime, timeRangeMinutes]);

  // Check if we have any data
  const hasData = graphData.some(({ points }) => points.length > 0);

  // Use full width of container (284px = sidebar width - padding, but with -mx-4 we extend to 300px to use all 6 columns)
  const GRAPH_WIDTH = 300;
  const graphWidth = GRAPH_WIDTH - GRAPH_PADDING.left - GRAPH_PADDING.right;
  const graphHeight = GRAPH_HEIGHT - GRAPH_PADDING.top - GRAPH_PADDING.bottom;

  // Normalize functions
  const normalizeX = (time: number) => {
    if (timeRange.max === timeRange.min) return 0;
    return ((time - timeRange.min) / (timeRange.max - timeRange.min)) * graphWidth;
  };

  const normalizeY = (sog: number) => {
    if (sogRange.max === sogRange.min) return graphHeight;
    return graphHeight - ((sog - sogRange.min) / (sogRange.max - sogRange.min)) * graphHeight;
  };

  // Generate path for each boat
  const generatePath = (points: Array<{ time: number; sog: number }>): string => {
    if (points.length === 0) return '';

    const pathPoints = points.map(
      (p) => `${normalizeX(p.time) + GRAPH_PADDING.left},${normalizeY(p.sog) + GRAPH_PADDING.top}`
    );

    return `M ${pathPoints.join(' L ')}`;
  };

  return (
    <div className="p-0 w-full h-full -mx-4">
      {!hasData ? (
        <div className="flex items-center justify-center h-[150px] text-xs text-muted-foreground">
          No data available
        </div>
      ) : (
        <>
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
            className="overflow-visible"
            preserveAspectRatio="none"
          >
            {/* Y-axis grid lines */}
            {[0, 5, 10, 15].map((value) => {
              if (value < sogRange.min || value > sogRange.max) return null;
              const y = normalizeY(value) + GRAPH_PADDING.top;
              return (
                <g key={`grid-y-${value}`}>
                  <line
                    x1={GRAPH_PADDING.left}
                    y1={y}
                    x2={GRAPH_PADDING.left + graphWidth}
                    y2={y}
                    stroke="currentColor"
                    strokeWidth="0.5"
                    className="text-border opacity-20"
                  />
                  <text
                    x={GRAPH_PADDING.left - 5}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="9"
                    className="fill-muted-foreground"
                  >
                    {value}
                  </text>
                </g>
              );
            })}

            {/* X-axis */}
            <line
              x1={GRAPH_PADDING.left}
              y1={GRAPH_PADDING.top + graphHeight}
              x2={GRAPH_PADDING.left + graphWidth}
              y2={GRAPH_PADDING.top + graphHeight}
              stroke="currentColor"
              strokeWidth="1"
              className="text-border"
            />

            {/* Y-axis */}
            <line
              x1={GRAPH_PADDING.left}
              y1={GRAPH_PADDING.top}
              x2={GRAPH_PADDING.left}
              y2={GRAPH_PADDING.top + graphHeight}
              stroke="currentColor"
              strokeWidth="1"
              className="text-border"
            />

            {/* Graph lines for each boat */}
            {graphData.map(({ boat, points }) => {
              if (points.length === 0) return null;
              const path = generatePath(points);
              if (!path) return null;

              return (
                <path
                  key={boat.id}
                  d={path}
                  fill="none"
                  stroke={boat.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

            {/* Current time indicator */}
            {currentTime !== null && (
              <line
                x1={normalizeX(currentTime) + GRAPH_PADDING.left}
                y1={GRAPH_PADDING.top}
                x2={normalizeX(currentTime) + GRAPH_PADDING.left}
                y2={GRAPH_PADDING.top + graphHeight}
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="4 2"
                className="text-foreground opacity-50"
              />
            )}
          </svg>
        </>
      )}
    </div>
  );
});

