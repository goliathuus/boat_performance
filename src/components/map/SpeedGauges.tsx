import { useMemo } from 'react';
import { useRaceStore } from '@/state/useRaceStore';
import { interpolatePosition } from '@/domain/tracks';
import { getSogColor } from '@/lib/color';
import type { BoatTrack } from '@/domain/types';

interface SpeedGaugesProps {
  boats: BoatTrack[];
  currentTime: number | null;
}

/**
 * Get SOG range from all boats for color normalization
 */
function getSogRange(boats: BoatTrack[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;

  for (const boat of boats) {
    for (const point of boat.points) {
      if (point.sog !== undefined) {
        min = Math.min(min, point.sog);
        max = Math.max(max, point.sog);
      }
    }
  }

  if (min === Infinity) {
    min = 0;
    max = 10;
  } else if (min === max) {
    max = min + 1;
  }

  return { min, max };
}

export function SpeedGauges({ boats, currentTime }: SpeedGaugesProps) {
  const sogRange = useMemo(() => getSogRange(boats), [boats]);

  // Get current SOG for each boat
  const boatSpeeds = useMemo(() => {
    if (currentTime === null) return [];
    return boats.map((boat) => {
      const pos = interpolatePosition(boat, currentTime);
      const sog = pos?.point?.sog;
      return {
        boat,
        sog: sog !== undefined ? sog : null,
        position: pos,
      };
    });
  }, [boats, currentTime]);

  if (boats.length === 0 || currentTime === null) {
    return null;
  }

  return (
    <div className="absolute left-4 top-20 z-[1000] flex flex-col gap-3">
      {boatSpeeds.map(({ boat, sog }) => {
        const normalizedSpeed =
          sog !== null
            ? Math.max(0, Math.min(1, (sog - sogRange.min) / (sogRange.max - sogRange.min)))
            : 0;
        const color = sog !== null ? getSogColor(sog, sogRange.min, sogRange.max) : boat.color;
        const height = 120; // Height of gauge in pixels

        return (
          <div
            key={boat.id}
            className="bg-background/95 backdrop-blur-sm border rounded-lg p-2 shadow-lg"
          >
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
              {/* Speed bar */}
              <div
                className="absolute bottom-0 w-full rounded-full transition-all duration-200"
                style={{
                  height: `${normalizedSpeed * 100}%`,
                  backgroundColor: color,
                  minHeight: normalizedSpeed > 0 ? '2px' : '0',
                }}
              />
            </div>
            <div className="text-xs mt-1 text-center font-mono">
              {sog !== null ? sog.toFixed(1) : '—'}
            </div>
            <div className="text-[8px] text-muted-foreground text-center">kn</div>
          </div>
        );
      })}
    </div>
  );
}

