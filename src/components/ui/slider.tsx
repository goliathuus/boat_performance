import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  min: number;
  max: number;
  step?: number;
  value: number;
  onValueChange: (value: number) => void;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, min, max, step = 1, value, onValueChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = Number.parseFloat(e.target.value);
      onValueChange(newValue);
    };

    return (
      <input
        type="range"
        ref={ref}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className={cn(
          'w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer',
          'accent-primary',
          className
        )}
        {...props}
      />
    );
  }
);
Slider.displayName = 'Slider';

export { Slider };
