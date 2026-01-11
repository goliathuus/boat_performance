import { useState, useEffect, useRef, useCallback } from 'react';

interface UseReplayClockResult {
  currentTime: number;
  playing: boolean;
  speed: number;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setCurrentTime: (time: number) => void;
}

/**
 * Hook to manage replay clock (global time)
 * Uses requestAnimationFrame for smooth animation
 */
export function useReplayClock(
  initialTime: number,
  minTime: number,
  maxTime: number,
  initialSpeed: number = 1
): UseReplayClockResult {
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const minTimeRef = useRef(minTime);
  const maxTimeRef = useRef(maxTime);

  // Update refs when bounds change
  useEffect(() => {
    minTimeRef.current = minTime;
    maxTimeRef.current = maxTime;
  }, [minTime, maxTime]);

  useEffect(() => {
    const maxT = maxTimeRef.current;
    if (!playing || currentTime >= maxT) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastTimestampRef.current = null;
      if (currentTime >= maxT) {
        setPlaying(false);
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }

      const delta = timestamp - lastTimestampRef.current;
      const timeDelta = delta * speed; // delta in ms, speed is multiplier
      lastTimestampRef.current = timestamp;

      setCurrentTime((prevTime) => {
        const maxT = maxTimeRef.current;
        const newTime = prevTime + timeDelta;
        if (newTime >= maxT) {
          setPlaying(false);
          return maxT;
        }
        return newTime;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    lastTimestampRef.current = null;
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastTimestampRef.current = null;
    };
  }, [playing, speed, currentTime]);

  const handleSetCurrentTime = useCallback((time: number) => {
    const minT = minTimeRef.current;
    const maxT = maxTimeRef.current;
    const clampedTime = Math.max(minT, Math.min(maxT, time));
    setCurrentTime(clampedTime);
  }, []);

  return {
    currentTime,
    playing,
    speed,
    setPlaying,
    setSpeed,
    setCurrentTime: handleSetCurrentTime,
  };
}

