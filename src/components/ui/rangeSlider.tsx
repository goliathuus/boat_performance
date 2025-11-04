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

    const startPercent = ((start - min) / (max - min)) * 100;
    const endPercent = ((end - min) / (max - min)) * 100;

    return (
      <div ref={ref} className={cn('relative w-full h-2', className)} {...props}>
        {/* Background track */}
        <div className="absolute w-full h-2 bg-secondary rounded-lg" />
        {/* Active range highlight */}
        <div
          className="absolute h-2 bg-primary/30 rounded-lg"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />
        {/* Start input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={start}
          onChange={handleStartChange}
          className={cn(
            'absolute w-full h-2 bg-transparent appearance-none cursor-pointer',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10',
            '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:relative [&::-moz-range-thumb]:z-10',
            '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-transparent',
            '[&::-moz-range-track]:h-2 [&::-moz-range-track]:bg-transparent'
          )}
          style={{ zIndex: start > end - (max - min) * 0.1 ? 3 : 1 }}
        />
        {/* End input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={end}
          onChange={handleEndChange}
          className={cn(
            'absolute w-full h-2 bg-transparent appearance-none cursor-pointer',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10',
            '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:relative [&::-moz-range-thumb]:z-10',
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

