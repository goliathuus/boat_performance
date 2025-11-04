import { useEffect, useRef } from 'react';
import { useRaceStore } from '@/state/useRaceStore';
import { Slider } from '@/components/ui/slider';
import { RangeSlider } from '@/components/ui/rangeSlider';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { formatTime, formatTimestampLocal } from '@/lib/time';

export function TimeController() {
  const dataset = useRaceStore((state) => state.dataset);
  const currentTime = useRaceStore((state) => state.currentTime);
  const speed = useRaceStore((state) => state.speed);
  const playing = useRaceStore((state) => state.playing);
  const timeRange = useRaceStore((state) => state.timeRange);
  const setCurrentTime = useRaceStore((state) => state.setCurrentTime);
  const setSpeed = useRaceStore((state) => state.setSpeed);
  const setPlaying = useRaceStore((state) => state.setPlaying);
  const setTimeRange = useRaceStore((state) => state.setTimeRange);
  const setAutoFitEnabled = useRaceStore((state) => state.setAutoFitEnabled);

  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const datasetRef = useRef(dataset);
  const tMaxRef = useRef<number | null>(null);

  // Update refs when dataset changes
  useEffect(() => {
    datasetRef.current = dataset;
    if (dataset) {
      const effectiveMax = timeRange ? timeRange[1] : dataset.tMax;
      tMaxRef.current = effectiveMax;
    } else {
      tMaxRef.current = null;
    }
  }, [dataset, timeRange]);

  // Fix freeze bug: use refs instead of direct dependencies
  useEffect(() => {
    if (!playing || !datasetRef.current || currentTime === null) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastTimeRef.current = null;
      return;
    }

    const animate = (timestamp: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }

      const delta = timestamp - lastTimeRef.current;
      const timeDelta = delta * speed; // delta is in ms, speed is multiplier (0.5x, 1x, 2x, etc.)
      lastTimeRef.current = timestamp;

      const currentDataset = datasetRef.current;
      if (!currentDataset) {
        cancelAnimationFrame(animationFrameRef.current!);
        animationFrameRef.current = null;
        return;
      }

      const effectiveMax = timeRange ? timeRange[1] : currentDataset.tMax;
      const newTime = currentTime + timeDelta;

      if (newTime >= effectiveMax) {
        setPlaying(false);
        setCurrentTime(effectiveMax);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        return;
      }

      setCurrentTime(newTime);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = null;
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastTimeRef.current = null;
    };
  }, [playing, speed, setCurrentTime, setPlaying, currentTime, timeRange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return; // Don't handle if typing in input
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying(!playing);
      } else if (e.code === 'ArrowLeft' && dataset && currentTime !== null) {
        e.preventDefault();
        const effectiveMin = timeRange ? timeRange[0] : dataset.tMin;
        const effectiveMax = timeRange ? timeRange[1] : dataset.tMax;
        // Step backward (1% of range or 1 second, whichever is larger)
        const step = Math.max(1000, (effectiveMax - effectiveMin) / 100);
        setCurrentTime(Math.max(effectiveMin, currentTime - step));
      } else if (e.code === 'ArrowRight' && dataset && currentTime !== null) {
        e.preventDefault();
        const effectiveMin = timeRange ? timeRange[0] : dataset.tMin;
        const effectiveMax = timeRange ? timeRange[1] : dataset.tMax;
        // Step forward
        const step = Math.max(1000, (effectiveMax - effectiveMin) / 100);
        setCurrentTime(Math.min(effectiveMax, currentTime + step));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playing, dataset, currentTime, setPlaying, setCurrentTime, timeRange]);

  if (!dataset || currentTime === null) {
    return (
      <div className="bg-background/80 backdrop-blur-sm border-t p-4 text-center text-muted-foreground">
        No data loaded. Import a CSV file to start.
      </div>
    );
  }

  const effectiveMin = timeRange ? timeRange[0] : dataset.tMin;
  const effectiveMax = timeRange ? timeRange[1] : dataset.tMax;
  const progress = ((currentTime - effectiveMin) / (effectiveMax - effectiveMin)) * 100;

  const handleSliderChange = (value: number) => {
    setCurrentTime(value);
    setAutoFitEnabled(false); // Disable auto-fit when manually moving slider
  };

  const handleRangeChange = (range: [number, number]) => {
    setTimeRange(range);
    setAutoFitEnabled(false);
    // Adjust currentTime if it's outside the new range
    if (currentTime < range[0]) {
      setCurrentTime(range[0]);
    } else if (currentTime > range[1]) {
      setCurrentTime(range[1]);
    }
  };

  return (
    <div className="bg-background/95 backdrop-blur-sm border-t p-4">
      <div className="max-w-7xl mx-auto flex flex-col gap-4">
        {/* Range Slider (time range selection) */}
        <div className="flex items-center gap-4">
          <div className="text-sm font-mono text-muted-foreground w-32 shrink-0">
            {formatTime(dataset.tMin)}
          </div>
          <div className="flex-1">
            <RangeSlider
              min={dataset.tMin}
              max={dataset.tMax}
              step={Math.max(100, (dataset.tMax - dataset.tMin) / 1000)}
              value={timeRange || [dataset.tMin, dataset.tMax]}
              onValueChange={handleRangeChange}
            />
          </div>
          <div className="text-sm font-mono text-muted-foreground w-32 text-right shrink-0">
            {formatTime(dataset.tMax)}
          </div>
        </div>

        {/* Current Time Slider */}
        <div className="flex items-center gap-4">
          <div className="text-sm font-mono text-muted-foreground w-32 shrink-0">
            {formatTime(effectiveMin)}
          </div>
          <div className="flex-1">
            <Slider
              min={effectiveMin}
              max={effectiveMax}
              step={Math.max(100, (effectiveMax - effectiveMin) / 1000)}
              value={currentTime}
              onValueChange={handleSliderChange}
            />
          </div>
          <div className="text-sm font-mono text-muted-foreground w-32 text-right shrink-0">
            {formatTime(effectiveMax)}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={playing ? 'default' : 'outline'}
              onClick={() => setPlaying(!playing)}
            >
              {playing ? '⏸️ Pause' : '▶️ Play'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPlaying(false);
                setCurrentTime(effectiveMin);
              }}
            >
              ⏮️ Reset
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (currentTime !== null) {
                  const step = Math.max(1000, (effectiveMax - effectiveMin) / 100);
                  setCurrentTime(Math.max(effectiveMin, currentTime - step));
                }
              }}
            >
              ⏪ Step
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (currentTime !== null) {
                  const step = Math.max(1000, (effectiveMax - effectiveMin) / 100);
                  setCurrentTime(Math.min(effectiveMax, currentTime + step));
                }
              }}
            >
              Step ⏩
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <Select
              value={speed.toString()}
              onChange={(e) => setSpeed(Number.parseFloat(e.target.value))}
              className="w-24"
            >
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="4">4x</option>
              <option value="8">8x</option>
              <option value="16">16x</option>
              <option value="24">24x</option>
              <option value="48">48x</option>
            </Select>

            <div className="text-sm font-mono min-w-[200px] text-right">
              {formatTime(currentTime)} UTC
              <br />
              <span className="text-xs text-muted-foreground">
                {formatTimestampLocal(currentTime)}
              </span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-secondary rounded-full overflow-hidden relative">
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
          {/* Time range indicator */}
          {timeRange && (
            <>
              <div
                className="absolute top-0 bottom-0 bg-primary/20 border-l border-primary"
                style={{
                  left: `${((timeRange[0] - dataset.tMin) / (dataset.tMax - dataset.tMin)) * 100}%`,
                }}
              />
              <div
                className="absolute top-0 bottom-0 bg-primary/20 border-r border-primary"
                style={{
                  left: `${((timeRange[1] - dataset.tMin) / (dataset.tMax - dataset.tMin)) * 100}%`,
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
