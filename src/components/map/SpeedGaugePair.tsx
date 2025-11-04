import { useMemo, memo } from 'react';
import type { BoatTrack } from '@/domain/types';
import { SpeedGauge } from './SpeedGauge';

interface SpeedGaugePairProps {
  boats: BoatTrack[];
  currentTime: number | null;
}

/**
 * Get SOG range for color normalization
 * Fixed range: 0-15 knots for consistent color scale
 */
function getSogRange(boats: BoatTrack[]): { min: number; max: number } {
  // Fixed range for consistent color scale across all tracks
  return { min: 0, max: 15 };
}

export const SpeedGaugePair = memo(function SpeedGaugePair({
  boats,
  currentTime,
}: SpeedGaugePairProps) {
  const sogRange = useMemo(() => getSogRange(boats), [boats]);

  // Take first two boats
  const boatsToShow = useMemo(() => boats.slice(0, 2), [boats]);

  if (boatsToShow.length === 0 || currentTime === null) {
    return null;
  }

  return (
    <div className="absolute left-4 top-[380px] z-[1000] flex gap-2">
      {boatsToShow.map((boat) => (
        <SpeedGauge
          key={boat.id}
          boat={boat}
          currentTime={currentTime}
          sogRange={sogRange}
          showAverage30s={true}
        />
      ))}
    </div>
  );
});

