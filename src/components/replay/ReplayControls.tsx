import { useReplayStore } from '@/state/useReplayStore';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
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
  const setPlaying = useReplayStore((state) => state.setPlaying);
  const setSpeed = useReplayStore((state) => state.setSpeed);

  const speedOptions = [0.5, 1, 2, 4, 8];

  if (globalTMin === null || globalTMax === null) {
    return null;
  }

  const progress = ((currentTime - globalTMin) / (globalTMax - globalTMin)) * 100;

  return (
    <div className="bg-background/95 backdrop-blur-sm border-t p-4">
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
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">
                {formatTime(currentTime)}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatTime(globalTMax)}
              </span>
            </div>
            <Slider
              value={progress}
              onValueChange={(value) => {
                const newTime = globalTMin + (value / 100) * (globalTMax - globalTMin);
                setCurrentTime(newTime);
              }}
              min={0}
              max={100}
              step={0.1}
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

