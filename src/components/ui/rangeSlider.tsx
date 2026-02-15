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
    const [draggingThumb, setDraggingThumb] = React.useState<'start' | 'end' | null>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const startPercent = ((start - min) / (max - min)) * 100;
    const endPercent = ((end - min) / (max - min)) * 100;

    const percentToValue = (percent: number) => {
      const rawValue = min + (percent / 100) * (max - min);
      // Round to nearest step
      return Math.round(rawValue / step) * step;
    };

    const handleThumbMouseDown = (thumb: 'start' | 'end', e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingThumb(thumb);
    };

    const handleMouseMove = React.useCallback(
      (e: MouseEvent) => {
        if (!draggingThumb || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
        const newValue = percentToValue(percent);

        if (draggingThumb === 'start') {
          const clampedStart = Math.max(min, Math.min(newValue, end));
          onValueChange([clampedStart, end]);
        } else {
          const clampedEnd = Math.max(start, Math.min(newValue, max));
          onValueChange([start, clampedEnd]);
        }
      },
      [draggingThumb, min, max, start, end, step, onValueChange]
    );

    const handleMouseUp = React.useCallback(() => {
      setDraggingThumb(null);
    }, []);

    React.useEffect(() => {
      if (draggingThumb) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
        };
      }
    }, [draggingThumb, handleMouseMove, handleMouseUp]);

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }
        }}
        className={cn('relative w-full h-2', className)}
        {...props}
      >
        {/* Background track - non clickable */}
        <div className="absolute w-full h-2 bg-secondary rounded-lg" />

        {/* Active range highlight */}
        <div
          className="absolute h-2 bg-primary/30 rounded-lg pointer-events-none"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />

        {/* Hidden inputs for value management (invisible but functional) */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={start}
          onChange={() => {}} // Controlled by custom thumbs
          className="absolute w-full h-2 opacity-0 pointer-events-none"
          style={{ zIndex: 0 }}
          tabIndex={-1}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={end}
          onChange={() => {}} // Controlled by custom thumbs
          className="absolute w-full h-2 opacity-0 pointer-events-none"
          style={{ zIndex: 0 }}
          tabIndex={-1}
        />

        {/* Custom Start thumb (blue) */}
        <div
          className={cn(
            'absolute w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-md cursor-pointer transition-transform',
            draggingThumb === 'start' && 'scale-125 border-[3px]'
          )}
          style={{
            left: `calc(${startPercent}% - 8px)`, // Center the 16px thumb
            top: '-6px', // Position above the track
            zIndex: draggingThumb === 'start' ? 10 : 3,
          }}
          onMouseDown={(e) => handleThumbMouseDown('start', e)}
        />

        {/* Custom End thumb (green) */}
        <div
          className={cn(
            'absolute w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-md cursor-pointer transition-transform',
            draggingThumb === 'end' && 'scale-125 border-[3px]'
          )}
          style={{
            left: `calc(${endPercent}% - 8px)`, // Center the 16px thumb
            top: '-6px', // Position above the track
            zIndex: draggingThumb === 'end' ? 10 : 4,
          }}
          onMouseDown={(e) => handleThumbMouseDown('end', e)}
        />
      </div>
    );
  }
);
RangeSlider.displayName = 'RangeSlider';

export { RangeSlider };

