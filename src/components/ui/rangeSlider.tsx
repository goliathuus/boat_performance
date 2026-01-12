import * as React from 'react';
import { cn } from '@/lib/utils';

export interface RangeSliderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'value' | 'onChange'> {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onValueChange: (value: [number, number]) => void;
}

const RangeSlider = React.forwardRef<HTMLDivElement, RangeSliderProps>(
  ({ className, min, max, step = 1, value, onValueChange, ...props }, ref) => {
    const [start, end] = value;

    const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newStart = Number.parseFloat(e.target.value);
      const clampedStart = Math.max(min, Math.min(newStart, end));
      onValueChange([clampedStart, end]);
    };

    const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newEnd = Number.parseFloat(e.target.value);
      const clampedEnd = Math.max(start, Math.min(newEnd, max));
      onValueChange([start, clampedEnd]);
    };

    const handleTrackClick = (e: React.MouseEvent) => {
      // Find the container div (might be currentTarget or a parent)
      let container = e.currentTarget as HTMLElement;
      
      // If currentTarget is an input, get the parent container
      if (container.tagName === 'INPUT') {
        container = container.parentElement as HTMLElement;
      }
      
      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickPercent = (clickX / rect.width) * 100;
      
      // Calculate thumb positions in pixels
      const startPercent = ((start - min) / (max - min)) * 100;
      const endPercent = ((end - min) / (max - min)) * 100;
      const startThumbX = (startPercent / 100) * rect.width;
      const endThumbX = (endPercent / 100) * rect.width;
      
      // Check if click is near a thumb (within 20px) - if so, it's a drag, not a jump
      const thumbClickThreshold = 20;
      if (Math.abs(clickX - startThumbX) < thumbClickThreshold || 
          Math.abs(clickX - endThumbX) < thumbClickThreshold) {
        return; // User is clicking on a thumb to drag, don't jump
      }
      
      // Convert percentage to value
      const clickValue = min + (clickPercent / 100) * (max - min);
      
      // Calculate distances to both thumbs
      const distToStart = Math.abs(clickValue - start);
      const distToEnd = Math.abs(clickValue - end);
      
      // Move the closest thumb to the clicked position
      if (distToStart < distToEnd) {
        // Closer to start thumb (blue) - move it
        const newStart = Math.max(min, Math.min(clickValue, end));
        onValueChange([newStart, end]);
      } else {
        // Closer to end thumb (green) or equal distance - move end
        const newEnd = Math.max(start, Math.min(clickValue, max));
        onValueChange([start, newEnd]);
      }
    };

    const startPercent = ((start - min) / (max - min)) * 100;
    const endPercent = ((end - min) / (max - min)) * 100;

    return (
      <div ref={ref} className={cn('relative w-full h-2', className)} {...props}>
        {/* Background track - clickable */}
        <div 
          className="absolute w-full h-2 bg-secondary rounded-lg cursor-pointer" 
          onClick={handleTrackClick}
        />
        {/* Active range highlight */}
        <div
          className="absolute h-2 bg-primary/30 rounded-lg pointer-events-none"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />
        {/* Start input (blue thumb) */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={start}
          onChange={handleStartChange}
          onClick={handleTrackClick}
          className={cn(
            'absolute w-full h-2 bg-transparent appearance-none cursor-pointer',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10',
            '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:relative [&::-moz-range-thumb]:z-10',
            '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-transparent',
            '[&::-moz-range-track]:h-2 [&::-moz-range-track]:bg-transparent'
          )}
          style={{ zIndex: start > end - (max - min) * 0.1 ? 3 : 1 }}
        />
        {/* End input (green/primary thumb) */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={end}
          onChange={handleEndChange}
          onClick={handleTrackClick}
          className={cn(
            'absolute w-full h-2 bg-transparent appearance-none cursor-pointer',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10',
            '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-green-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:relative [&::-moz-range-thumb]:z-10',
            '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-transparent',
            '[&::-moz-range-track]:h-2 [&::-moz-range-track]:bg-transparent'
          )}
          style={{ zIndex: end < start + (max - min) * 0.1 ? 3 : 2 }}
        />
      </div>
    );
  }
);
RangeSlider.displayName = 'RangeSlider';

export { RangeSlider };

