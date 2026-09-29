import * as React from 'react';
import { cn } from '@/lib/utils';

export interface RangeSliderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'value' | 'onChange'> {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onValueChange: (value: [number, number]) => void;
  /** Libelles lus par les lecteurs d'ecran pour chaque poignee. */
  startLabel?: string;
  endLabel?: string;
  /** Formate la valeur annoncee (aria-valuetext). */
  formatValue?: (value: number) => string;
  /** 'lg' : piste et pastilles agrandies pour le doigt (replay sur telephone). */
  size?: 'md' | 'lg';
}

type Thumb = 'start' | 'end';

/**
 * Slider a deux poignees, pilotable a la souris, au doigt et au clavier.
 *
 * Les Pointer Events couvrent souris, tactile et stylet en un seul chemin :
 * la version precedente n'ecoutait que les evenements souris, donc le curseur
 * etait immobile sur telephone. La zone de saisie fait 44 px (cible tactile),
 * la pastille visible reste petite.
 */
const RangeSlider = React.forwardRef<HTMLDivElement, RangeSliderProps>(
  (
    {
      className,
      min,
      max,
      step = 1,
      value,
      onValueChange,
      startLabel = 'Début de la fenêtre',
      endLabel = 'Tête de lecture',
      formatValue,
      size = 'md',
      ...props
    },
    ref
  ) => {
    const [start, end] = value;
    const [dragging, setDragging] = React.useState<Thumb | null>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const span = max - min;
    const startPercent = span === 0 ? 0 : ((start - min) / span) * 100;
    const endPercent = span === 0 ? 0 : ((end - min) / span) * 100;

    const quantize = React.useCallback(
      (raw: number) => {
        const snapped = Math.round(raw / step) * step;
        return Math.max(min, Math.min(max, snapped));
      },
      [min, max, step]
    );

    const commit = React.useCallback(
      (thumb: Thumb, next: number) => {
        if (thumb === 'start') {
          onValueChange([Math.min(quantize(next), end), end]);
        } else {
          onValueChange([start, Math.max(quantize(next), start)]);
        }
      },
      [onValueChange, quantize, start, end]
    );

    const valueFromClientX = React.useCallback(
      (clientX: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return min;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return min + ratio * span;
      },
      [min, span]
    );

    const onThumbPointerDown = (thumb: Thumb) => (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      // La capture garde le pointeur sur la poignee meme si le doigt en sort ;
      // elle peut echouer, et le drag doit continuer de fonctionner sans elle,
      // d'ou les ecouteurs sur window plus bas.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture indisponible : les ecouteurs window prennent le relais */
      }
      setDragging(thumb);
    };

    const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      commit('end', valueFromClientX(e.clientX));
      setDragging('end');
    };

    const draggingRef = React.useRef<Thumb | null>(null);
    draggingRef.current = dragging;

    const commitRef = React.useRef(commit);
    commitRef.current = commit;

    const valueFromClientXRef = React.useRef(valueFromClientX);
    valueFromClientXRef.current = valueFromClientX;

    React.useEffect(() => {
      if (!dragging) return;

      const onMove = (e: PointerEvent) => {
        const thumb = draggingRef.current;
        if (!thumb) return;
        e.preventDefault();
        commitRef.current(thumb, valueFromClientXRef.current(e.clientX));
      };
      const onUp = () => setDragging(null);

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
    }, [dragging]);

    const onThumbKeyDown = (thumb: Thumb) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const current = thumb === 'start' ? start : end;
      const big = step * 10;
      let next: number | null = null;

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          next = current - step;
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          next = current + step;
          break;
        case 'PageDown':
          next = current - big;
          break;
        case 'PageUp':
          next = current + big;
          break;
        case 'Home':
          next = min;
          break;
        case 'End':
          next = max;
          break;
        default:
          return;
      }

      e.preventDefault();
      commit(thumb, next);
    };

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [ref]
    );

    const describe = (v: number) => (formatValue ? formatValue(v) : String(v));

    // Cible tactile (hit) et piste (track), en px ; la cible est centree sur la piste.
    const large = size === 'lg';
    const hit = large ? 48 : 44;
    const track = large ? 10 : 8;

    const thumb = (kind: Thumb) => {
      const isStart = kind === 'start';
      const percent = isStart ? startPercent : endPercent;
      const current = isStart ? start : end;
      const active = dragging === kind;

      return (
        <button
          type="button"
          role="slider"
          aria-label={isStart ? startLabel : endLabel}
          aria-valuemin={isStart ? min : start}
          aria-valuemax={isStart ? end : max}
          aria-valuenow={current}
          aria-valuetext={describe(current)}
          aria-orientation="horizontal"
          onPointerDown={onThumbPointerDown(kind)}
          onKeyDown={onThumbKeyDown(kind)}
          /* La cible fait 44 px pour le doigt ; seule la pastille interne se voit. */
          className={cn(
            'absolute grid place-items-center bg-transparent p-0 touch-none',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            'focus-visible:ring-offset-background rounded-full',
            active ? 'cursor-grabbing' : 'cursor-grab'
          )}
          style={{
            left: `calc(${percent}% - ${hit / 2}px)`,
            top: `${-(hit - track) / 2}px`,
            width: hit,
            height: hit,
            zIndex: active ? 10 : isStart ? 3 : 4,
          }}
        >
          <span
            className={cn(
              'block rounded-full border-2 border-white shadow-md transition-transform',
              large ? 'h-6 w-6' : 'h-5 w-5 sm:h-4 sm:w-4',
              isStart ? 'bg-primary' : 'bg-foreground',
              active && 'scale-125'
            )}
          />
        </button>
      );
    };

    return (
      <div
        ref={setRefs}
        className={cn('relative w-full touch-none', className)}
        style={{ height: track }}
        {...props}
      >
        {/* Zone de tap invisible, plus haute que la piste. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 cursor-pointer"
          style={{ top: -(hit - track) / 2, height: hit }}
          onPointerDown={onTrackPointerDown}
        />
        <div className="pointer-events-none absolute h-full w-full rounded-full bg-secondary" />
        {/* Fenetre deja jouee, entre les deux pastilles. */}
        <div
          className="pointer-events-none absolute h-full rounded-full bg-primary/55"
          style={{
            left: `${startPercent}%`,
            width: `${Math.max(0, endPercent - startPercent)}%`,
          }}
        />
        {thumb('start')}
        {thumb('end')}
      </div>
    );
  }
);
RangeSlider.displayName = 'RangeSlider';

export { RangeSlider };
