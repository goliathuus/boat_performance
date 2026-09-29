import { useEffect, useMemo } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import { RangeSlider } from '@/components/ui/rangeSlider';
import { Select } from '@/components/ui/select';
import { formatTime } from '@/lib/time';
import { cn } from '@/lib/utils';

interface ReplayControlsProps {
  currentTime: number;
  setCurrentTime: (time: number) => void;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TICK_STEPS = [5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR];

/**
 * Graduations de la timeline, alignees sur des heures rondes (UTC, comme
 * tous les horaires affiches). Le pas grandit avec la duree pour ne jamais
 * depasser une huitaine de reperes.
 */
function computeTicks(tMin: number, tMax: number): Array<{ t: number; label: string }> {
  const span = tMax - tMin;
  if (!(span > 0)) return [];
  const step = TICK_STEPS.find((s) => span / s <= 8) ?? 24 * HOUR;
  const ticks: Array<{ t: number; label: string }> = [];
  // Pas de repere colle au bord droit : son libelle serait coupe.
  for (let t = Math.ceil(tMin / step) * step; t <= tMax - span * 0.05; t += step) {
    const d = new Date(t);
    const label =
      step >= 24 * HOUR
        ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
        : d.toISOString().slice(11, 16);
    ticks.push({ t, label });
  }
  return ticks;
}

const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
  </svg>
);

const PauseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

export function ReplayControls({ currentTime, setCurrentTime }: ReplayControlsProps) {
  const playing = useReplayStore((state) => state.playing);
  const speed = useReplayStore((state) => state.speed);
  const globalTMin = useReplayStore((state) => state.globalTMin);
  const globalTMax = useReplayStore((state) => state.globalTMax);
  const windowStartTime = useReplayStore((state) => state.windowStartTime);
  const setPlaying = useReplayStore((state) => state.setPlaying);
  const setSpeed = useReplayStore((state) => state.setSpeed);
  const setWindowStartTime = useReplayStore((state) => state.setWindowStartTime);

  const speedOptions = [1, 5, 10, 25, 50, 100, 250, 500];

  // Normaliser la vitesse si elle n'est pas dans la liste
  useEffect(() => {
    if (!speedOptions.includes(speed)) {
      setSpeed(1);
    }
  }, [speed, setSpeed]);

  const currentSpeed = speedOptions.includes(speed) ? speed : 1;

  const ticks = useMemo(
    () => (globalTMin !== null && globalTMax !== null ? computeTicks(globalTMin, globalTMax) : []),
    [globalTMin, globalTMax]
  );

  if (globalTMin === null || globalTMax === null || windowStartTime === null) {
    return null;
  }

  const span = globalTMax - globalTMin;
  const startProgress = ((windowStartTime - globalTMin) / span) * 100;
  const currentProgress = ((currentTime - globalTMin) / span) * 100;
  const currentDate = new Date(currentTime).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  const speedSelect = (className: string) => (
    <Select
      value={currentSpeed.toString()}
      onChange={(e) => setSpeed(Number.parseFloat(e.target.value))}
      className={cn('h-8 rounded-full px-3 py-0 text-xs', className)}
      aria-label="Vitesse de lecture"
    >
      {speedOptions.map((s) => (
        <option key={s} value={s.toString()}>
          {s}x
        </option>
      ))}
    </Select>
  );

  return (
    <div className="glass border-t px-3 pb-2 pt-2 sm:px-4 sm:pb-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-nowrap sm:gap-4">
        <img
          src="/sh.png"
          alt="SH Course au large"
          className="hidden md:block h-12 lg:h-14 w-auto opacity-80 flex-none"
        />

        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pause' : 'Lecture'}
          title={playing ? 'Pause' : 'Lecture'}
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/30 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        <div className="flex-none leading-tight tabular-nums">
          <div className="text-base font-semibold sm:text-lg">{formatTime(currentTime)}</div>
          <div className="text-[11px] text-muted-foreground">{currentDate} · UTC</div>
        </div>

        <div className="order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1">
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
            <span>
              Fenêtre dès <span className="font-semibold text-primary">{formatTime(windowStartTime)}</span>
            </span>
            <span className="hidden sm:inline">Fin {formatTime(globalTMax)}</span>
          </div>
          <RangeSlider
            min={0}
            max={100}
            step={0.1}
            value={[startProgress, currentProgress]}
            onValueChange={([newStartProgress, newCurrentProgress]) => {
              const newWindowTime = globalTMin + (newStartProgress / 100) * span;
              const newCurrentTime = globalTMin + (newCurrentProgress / 100) * span;
              setWindowStartTime(newWindowTime, newCurrentTime);
              setCurrentTime(newCurrentTime);
            }}
            className="w-full"
            startLabel="Début de la fenêtre de replay"
            endLabel="Tête de lecture"
            formatValue={(pct) => formatTime(globalTMin + (pct / 100) * span)}
          />
          {/* Graduations horaires, facon bandeau de previsions */}
          <div className="relative h-4 overflow-hidden text-[10px] tabular-nums text-muted-foreground" aria-hidden="true">
            {ticks.map(({ t, label }, i) => (
              <span
                key={t}
                className={cn(
                  'absolute top-0 border-l border-foreground/20 pl-1 pt-0.5 leading-none',
                  // Sur mobile, un repere sur deux suffit.
                  i % 2 === 1 && 'hidden sm:block'
                )}
                style={{ left: `${((t - globalTMin) / span) * 100}%` }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {speedSelect('ml-auto w-[4.5rem] flex-none sm:ml-0')}
      </div>
    </div>
  );
}
