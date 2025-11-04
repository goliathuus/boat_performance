import { useMemo, memo } from 'react';
import { useRaceStore } from '@/state/useRaceStore';
import { interpolatePosition } from '@/domain/tracks';
import type { BoatTrack } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';

interface WindRoseProps {
  boats: BoatTrack[];
  currentTime: number | null;
}

const ROSE_SIZE = 180; // Size in pixels
const ROSE_RADIUS = ROSE_SIZE / 2 - 20; // Inner radius for arrows

export const WindRose = memo(function WindRose({ boats, currentTime }: WindRoseProps) {
  const windAngleMode = useRaceStore((state) => state.windAngleMode);
  const showTWD = useRaceStore((state) => state.showTWD);
  const setWindAngleMode = useRaceStore((state) => state.setWindAngleMode);
  const setShowTWD = useRaceStore((state) => state.setShowTWD);

  // Get current wind angles for each boat (memoized)
  const boatWindData = useMemo(() => {
    if (currentTime === null) return [];
    return boats.map((boat) => {
      const pos = interpolatePosition(boat, currentTime);
      if (!pos || !pos.point) {
        return { boat, angle: null };
      }

      const angle =
        windAngleMode === 'AWA'
          ? pos.point.awa
          : windAngleMode === 'TWA'
            ? pos.point.twa
            : null;

      return {
        boat,
        angle: angle !== undefined ? angle : null,
        position: pos,
      };
    });
  }, [boats, currentTime, windAngleMode]);

  const hasData = boatWindData.some((d) => d.angle !== null);

  return (
    <div className="absolute top-4 left-4 z-[1000] bg-background/95 backdrop-blur-sm border rounded-2xl shadow-lg p-4">
      {/* Controls */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1 border rounded-md p-0.5">
          <Button
            size="sm"
            variant={windAngleMode === 'AWA' ? 'default' : 'ghost'}
            onClick={() => setWindAngleMode('AWA')}
            className="h-6 px-2 text-xs"
          >
            AWA
          </Button>
          <Button
            size="sm"
            variant={windAngleMode === 'TWA' ? 'default' : 'ghost'}
            onClick={() => setWindAngleMode('TWA')}
            className="h-6 px-2 text-xs"
          >
            TWA
          </Button>
        </div>
        <Toggle
          pressed={showTWD}
          onPressedChange={setShowTWD}
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
        >
          TWD
        </Toggle>
      </div>

      {/* Wind Rose Circle */}
      <div className="relative" style={{ width: ROSE_SIZE, height: ROSE_SIZE }}>
        <svg width={ROSE_SIZE} height={ROSE_SIZE} viewBox={`0 0 ${ROSE_SIZE} ${ROSE_SIZE}`}>
          {/* Background circle */}
          <circle
            cx={ROSE_SIZE / 2}
            cy={ROSE_SIZE / 2}
            r={ROSE_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-border opacity-30"
          />

          {/* Graduation circles */}
          <circle
            cx={ROSE_SIZE / 2}
            cy={ROSE_SIZE / 2}
            r={ROSE_RADIUS * 0.5}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-border opacity-20"
          />
          <circle
            cx={ROSE_SIZE / 2}
            cy={ROSE_SIZE / 2}
            r={ROSE_RADIUS * 0.67}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-border opacity-20"
          />

          {/* Cardinal directions */}
          {['N', 'E', 'S', 'W'].map((dir, idx) => {
            const angle = idx * 90;
            const rad = (angle * Math.PI) / 180;
            const x = ROSE_SIZE / 2 + Math.sin(rad) * (ROSE_RADIUS + 10);
            const y = ROSE_SIZE / 2 - Math.cos(rad) * (ROSE_RADIUS + 10);
            return (
              <text
                key={dir}
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

          {/* Boat icon at center */}
          <g transform={`translate(${ROSE_SIZE / 2}, ${ROSE_SIZE / 2})`}>
            <path
              d="M0,-8 L6,8 L4,8 L2,0 L-2,0 L-4,8 L-6,8 Z"
              fill="currentColor"
              className="text-foreground opacity-60"
            />
          </g>

          {/* Wind arrows (inward) */}
          {(() => {
            // First pass: calculate all label positions
            const labelPositions = boatWindData
              .map(({ boat, angle, position }, idx) => {
                if (angle === null || angle === undefined) return null;
                
                const svgAngle = angle;
                const rad = (svgAngle * Math.PI) / 180;
                const arrowLength = ROSE_RADIUS * 0.75;
                const endX = ROSE_SIZE / 2 + Math.sin(rad) * (ROSE_RADIUS - arrowLength);
                const endY = ROSE_SIZE / 2 - Math.cos(rad) * (ROSE_RADIUS - arrowLength);
                
                // Initial label position (above arrow tip)
                const labelRadius = 10; // Radius of label circle
                const labelOffset = 8; // Distance from arrow tip
                const labelX = endX;
                const labelY = endY - labelOffset;
                
                // Get display value
                let displayValue: number | null = null;
                if (angle !== null && angle !== undefined) {
                  if (angle <= 180) {
                    displayValue = angle;
                  } else {
                    displayValue = 360 - angle;
                  }
                }
                
                return {
                  boat,
                  angle,
                  position,
                  rad,
                  endX,
                  endY,
                  labelX,
                  labelY,
                  displayValue,
                  adjusted: false,
                };
              })
              .filter((item): item is NonNullable<typeof item> => item !== null);
            
            // Second pass: detect and resolve overlaps
            // Check distance between displayed label positions
            const MIN_DISTANCE = 22; // Minimum distance between labels (2 * label radius + padding)
            const MAX_ITERATIONS = 10; // Maximum iterations for adjustment
            
            // Iteratively adjust positions until no overlaps remain
            for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
              let hasOverlap = false;
              
              for (let i = 0; i < labelPositions.length; i++) {
                for (let j = i + 1; j < labelPositions.length; j++) {
                  const pos1 = labelPositions[i];
                  const pos2 = labelPositions[j];
                  
                  // Calculate distance between displayed label positions
                  const dx = pos2.labelX - pos1.labelX;
                  const dy = pos2.labelY - pos1.labelY;
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  
                  if (distance < MIN_DISTANCE) {
                    hasOverlap = true;
                    
                    // Calculate direction vector between labels
                    const directionX = dx / distance;
                    const directionY = dy / distance;
                    
                    // Calculate required separation
                    const separation = MIN_DISTANCE - distance;
                    const offset = separation / 2 + 1;
                    
                    // Move labels apart along the line connecting them
                    pos1.labelX -= directionX * offset;
                    pos1.labelY -= directionY * offset;
                    pos2.labelX += directionX * offset;
                    pos2.labelY += directionY * offset;
                    
                    pos1.adjusted = true;
                    pos2.adjusted = true;
                  }
                }
              }
              
              // If no overlaps found, we're done
              if (!hasOverlap) {
                break;
              }
            }
            
            // Render arrows with adjusted label positions
            return labelPositions.map(({ boat, angle, position, rad, endX, endY, labelX, labelY, displayValue }) => {
              // Calculate arrow position (from edge towards center)
              const arrowLength = ROSE_RADIUS * 0.75;
              const startX = ROSE_SIZE / 2 + Math.sin(rad) * ROSE_RADIUS;
              const startY = ROSE_SIZE / 2 - Math.cos(rad) * ROSE_RADIUS;
              
              // Arrowhead points towards center (inward)
              const arrowheadSize = 10;
              // Direction from end point towards center
              const centerX = ROSE_SIZE / 2;
              const centerY = ROSE_SIZE / 2;
              const dx = centerX - endX;
              const dy = centerY - endY;
              const arrowheadAngle = Math.atan2(dy, dx);
              const arrowheadX1 = endX + arrowheadSize * Math.cos(arrowheadAngle - Math.PI / 6);
              const arrowheadY1 = endY + arrowheadSize * Math.sin(arrowheadAngle - Math.PI / 6);
              const arrowheadX2 = endX + arrowheadSize * Math.cos(arrowheadAngle + Math.PI / 6);
              const arrowheadY2 = endY + arrowheadSize * Math.sin(arrowheadAngle + Math.PI / 6);

              return (
                <g key={boat.id}>
                {/* Arrow line with white outline for visibility - thinner */}
                {/* Each boat has a unique color from boat.color (generated by generateBoatColor) */}
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke="white"
                  strokeWidth="4"
                  strokeLinecap="round"
                  opacity="0.8"
                />
                {/* Main arrow line - unique color per boat - thinner */}
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={boat.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity="1"
                />
                {/* Arrowhead with white outline - smaller */}
                <path
                  d={`M ${endX} ${endY} L ${arrowheadX1} ${arrowheadY1} L ${arrowheadX2} ${arrowheadY2} Z`}
                  fill="white"
                  stroke="white"
                  strokeWidth="1.5"
                  opacity="0.8"
                />
                {/* Arrowhead fill - unique color per boat */}
                <path
                  d={`M ${endX} ${endY} L ${arrowheadX1} ${arrowheadY1} L ${arrowheadX2} ${arrowheadY2} Z`}
                  fill={boat.color}
                  stroke={boat.color}
                  strokeWidth="0.5"
                  opacity="1"
                />
              {/* Wind angle value text at arrow tip (AWA or TWA based on mode) */}
              {displayValue !== undefined && displayValue !== null && (
                <>
                  {/* White background circle for readability */}
                  <circle
                    cx={labelX}
                    cy={labelY}
                    r="10"
                    fill="white"
                    fillOpacity="0.9"
                    stroke="white"
                    strokeWidth="1"
                  />
                  {/* Wind angle value text (AWA or TWA) */}
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill={boat.color}
                  >
                    {displayValue.toFixed(0)}°
                  </text>
                </>
              )}
            </g>
            );
          })})()}
        </svg>

        {/* No data message */}
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">n/a</span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 space-y-1">
        {boatWindData.map(({ boat, angle }) => (
          <div key={boat.id} className="flex items-center gap-2 text-xs">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: boat.color }}
            />
            <span className="truncate">{boat.name}</span>
            {angle === null && (
              <span className="text-muted-foreground ml-auto">n/a</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

