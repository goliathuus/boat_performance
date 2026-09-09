import { useEffect } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import { Button } from '@/components/ui/button';
import { RangeSlider } from '@/components/ui/rangeSlider';
import { Select } from '@/components/ui/select';
import { formatTime } from '@/lib/time';

interface ReplayControlsProps {
  currentTime: number;
  setCurrentTime: (time: number) => void;
}

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

  if (globalTMin === null || globalTMax === null || windowStartTime === null) {
    return null;
  }

  const startProgress = ((windowStartTime - globalTMin) / (globalTMax - globalTMin)) * 100;
  const currentProgress = ((currentTime - globalTMin) / (globalTMax - globalTMin)) * 100;

  return (
    <div className="bg-background/95 backdrop-blur-sm border-t px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="flex items-center gap-3 sm:gap-5">
        <img
          src="/sh.png"
          alt="SH Course au large"
          className="hidden md:block h-12 lg:h-16 w-auto opacity-80 flex-none"
        />
        <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">
        {/* Lecture, vitesse, puis la timeline pleine largeur */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-3 flex-none">
            <Button
              onClick={() => setPlaying(!playing)}
              variant={playing ? 'default' : 'outline'}
              size="sm"
            >
              {playing ? '❚❚ Pause' : '▶ Lecture'}
            </Button>
            <div className="flex items-center gap-2 sm:hidden">
              <span className="text-xs text-muted-foreground">Vitesse</span>
              <Select
                value={currentSpeed.toString()}
                onChange={(e) => setSpeed(Number.parseFloat(e.target.value))}
                className="w-20"
              >
                {speedOptions.map((s) => (
                  <option key={s} value={s.toString()}>
                    {s}x
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs tabular-nums">
              <span className="flex items-baseline gap-1.5">
                <span className="text-muted-foreground">Début</span>
                <span className="text-sm font-semibold text-primary">{formatTime(windowStartTime)}</span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-muted-foreground">Lecture</span>
                <span className="text-sm font-semibold text-foreground">{formatTime(currentTime)}</span>
              </span>
              <span className="ml-auto text-muted-foreground">Fin {formatTime(globalTMax)}</span>
            </div>
            <RangeSlider
              min={0}
              max={100}
              step={0.1}
              value={[startProgress, currentProgress]}
              onValueChange={([newStartProgress, newCurrentProgress]) => {
                const newWindowTime = globalTMin + (newStartProgress / 100) * (globalTMax - globalTMin);
                const newCurrentTime = globalTMin + (newCurrentProgress / 100) * (globalTMax - globalTMin);
                setWindowStartTime(newWindowTime, newCurrentTime);
                setCurrentTime(newCurrentTime);
              }}
              className="w-full"
              startLabel="Début de la fenêtre de replay"
              endLabel="Tête de lecture"
              formatValue={(pct) => formatTime(globalTMin + (pct / 100) * (globalTMax - globalTMin))}
            />
          </div>
        </div>

        {/* Speed controls (desktop : la version mobile est sur la ligne Lecture) */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Vitesse</span>
          <Select
            value={currentSpeed.toString()}
            onChange={(e) => setSpeed(Number.parseFloat(e.target.value))}
            className="w-32"
          >
            {speedOptions.map((s) => (
              <option key={s} value={s.toString()}>
                {s}x
              </option>
            ))}
          </Select>
        </div>
        </div>
      </div>
    </div>
  );
}

