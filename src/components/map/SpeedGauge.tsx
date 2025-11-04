import { memo, useMemo } from 'react';
import type { BoatTrack } from '@/domain/types';
import { calculateAverageSOG, interpolatePosition } from '@/domain/tracks';

interface SpeedGaugeProps {
  boat: BoatTrack;
  currentTime: number | null;
  sogRange: { min: number; max: number };
  showAverage30s?: boolean;
  height?: number;
}

export const SpeedGauge = memo(function SpeedGauge({
  boat,
  currentTime,
  sogRange,
  showAverage30s = false,
  height = 120,
}: SpeedGaugeProps) {
  if (currentTime === null) {
    return null;
  }

  // Get current SOG using interpolatePosition (memoized)
  const currentPos = useMemo(
    () => interpolatePosition(boat, currentTime),
    [boat, currentTime]
  );
  const sog = currentPos?.point?.sog ?? null;

  // Calculate 30s average if requested (memoized)
  const avg30s = useMemo(
    () => (showAverage30s ? calculateAverageSOG(boat, currentTime, 30) : null),
    [showAverage30s, boat, currentTime]
  );

  const normalizedSpeed =
    sog !== null
      ? Math.max(0, Math.min(1, (sog - sogRange.min) / (sogRange.max - sogRange.min)))
      : 0;
  const normalizedAvg30s =
    avg30s !== null
      ? Math.max(0, Math.min(1, (avg30s - sogRange.min) / (sogRange.max - sogRange.min)))
      : 0;

  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-2 shadow-lg">
      <div className="text-xs font-semibold mb-1 truncate max-w-[80px]" title={boat.name}>
        {boat.name}
      </div>
      <div className="relative" style={{ width: '16px', height: `${height}px` }}>
        {/* Background bar */}
        <div
          className="absolute bottom-0 w-full rounded-full"
          style={{
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
          }}
        />
        {/* Speed bar (boat color) - 50% opacity to see 30s average overlay */}
        <div
          className="absolute bottom-0 w-full rounded-full transition-all duration-200"
          style={{
            height: `${normalizedSpeed * 100}%`,
            backgroundColor: boat.color,
            opacity: 0.5,
            minHeight: normalizedSpeed > 0 ? '2px' : '0',
          }}
        />
        {/* 30s average overlay (more transparent) */}
        {showAverage30s && avg30s !== null && (
          <div
            className="absolute bottom-0 w-full rounded-full transition-all duration-200 border-2 border-black/40"
            style={{
              height: `${normalizedAvg30s * 100}%`,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              minHeight: normalizedAvg30s > 0 ? '2px' : '0',
            }}
          />
        )}
      </div>
      <div className="text-xs mt-1 text-center font-mono">
        {sog !== null ? sog.toFixed(1) : '—'}
      </div>
      {showAverage30s && avg30s !== null && (
        <div className="text-[10px] mt-0.5 text-center font-mono text-muted-foreground">
          {avg30s.toFixed(1)}
        </div>
      )}
      <div className="text-[8px] text-muted-foreground text-center">kn</div>
    </div>
  );
});

