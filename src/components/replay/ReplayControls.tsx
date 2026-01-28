import { useReplayStore } from '@/state/useReplayStore';
import { Button } from '@/components/ui/button';
import { RangeSlider } from '@/components/ui/rangeSlider';
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

  const speedOptions = [0.5, 1, 2, 4, 8];

  if (globalTMin === null || globalTMax === null || windowStartTime === null) {
    return null;
  }

  const startProgress = ((windowStartTime - globalTMin) / (globalTMax - globalTMin)) * 100;
  const currentProgress = ((currentTime - globalTMin) / (globalTMax - globalTMin)) * 100;

  return (
    <div className="bg-background/95 backdrop-blur-sm border-t p-4 relative">
      {/* Logo en bas à gauche */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
        <img 
          src="/sh.png" 
          alt="Sh course au large" 
          className="h-20 w-auto opacity-80"
        />
      </div>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Time display and play/pause */}
        <div className="flex items-center gap-4">
          <Button
            onClick={() => setPlaying(!playing)}
            variant={playing ? 'default' : 'outline'}
            size="sm"
          >
            {playing ? '⏸ Pause' : '▶ Play'}
          </Button>

          <div className="flex-1">
            <div className="mb-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium min-w-[50px]">Start:</span>
                <span className="text-sm text-blue-500 font-semibold">
                  {formatTime(windowStartTime)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium min-w-[50px]">End:</span>
                <span className="text-sm text-green-500 font-semibold">
                  {formatTime(currentTime)}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  Max: {formatTime(globalTMax)}
                </span>
              </div>
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
            />
          </div>
        </div>

        {/* Speed controls */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Speed:</span>
          <div className="flex gap-1">
            {speedOptions.map((s) => (
              <Button
                key={s}
                onClick={() => setSpeed(s)}
                variant={speed === s ? 'default' : 'outline'}
                size="sm"
                className="min-w-[50px]"
              >
                {s}x
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

