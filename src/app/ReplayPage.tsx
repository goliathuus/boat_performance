import { useEffect, useRef } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import { useReplayClock } from '@/hooks/useReplayClock';
import { ReplayMapWithData } from '@/components/replay/ReplayMap';
import { BoatListPanel } from '@/components/replay/BoatListPanel';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { useEventTelemetry } from '@/hooks/useEventTelemetry';
import { useSessionTelemetry } from '@/hooks/useSessionTelemetry';
import { Button } from '@/components/ui/button';

interface ReplayPageProps {
  onBack: () => void;
  onLogout?: () => void;
}

export function ReplayPage({ onBack, onLogout }: ReplayPageProps) {
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const selectedEventId = useReplayStore((state) => state.selectedEventId);
  const selectedSessionId = useReplayStore((state) => state.selectedSessionId);
  const globalTMin = useReplayStore((state) => state.globalTMin);
  const globalTMax = useReplayStore((state) => state.globalTMax);
  const setCurrentTime = useReplayStore((state) => state.setCurrentTime);
  const playing = useReplayStore((state) => state.playing);
  const speed = useReplayStore((state) => state.speed);
  const currentTime = useReplayStore((state) => state.currentTime);

  // Load telemetry based on mode: event or individual session
  useEventTelemetry(selectedEventId);
  useSessionTelemetry(selectedSessionId);

  // Initialize replay clock (only when times are available)
  const clock = useReplayClock(
    globalTMin ?? 0,
    globalTMin ?? 0,
    globalTMax ?? Date.now(),
    speed
  );

  // Initialize clock time when globalTMin becomes available and ensure bounds
  useEffect(() => {
    if (globalTMin !== null && globalTMax !== null) {
      // If clock is at 0 (initial state) and store currentTime is null, initialize at the end
      if (clock.currentTime === 0 && currentTime === null) {
        clock.setCurrentTime(globalTMax);
        setCurrentTime(globalTMax);
      }
      // Ensure clock time is within bounds
      if (clock.currentTime < globalTMin) {
        clock.setCurrentTime(globalTMin);
      }
      if (clock.currentTime > globalTMax) {
        clock.setCurrentTime(globalTMax);
      }
    }
  }, [globalTMin, globalTMax, clock, currentTime, setCurrentTime]);

  // Sync clock currentTime to store (one-way: clock -> store)
  useEffect(() => {
    if (clock.currentTime > 0) {
      setCurrentTime(clock.currentTime);
    }
  }, [clock.currentTime, setCurrentTime]);

  // Sync store playing/speed to clock (one-way: store -> clock)
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  playingRef.current = playing;
  speedRef.current = speed;

  useEffect(() => {
    if (playingRef.current !== clock.playing) {
      clock.setPlaying(playingRef.current);
    }
  }, [playing, clock]);

  useEffect(() => {
    if (speedRef.current !== clock.speed) {
      clock.setSpeed(speedRef.current);
    }
  }, [speed, clock]);

  // Update clock time when user scrubs (store -> clock)
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  
  useEffect(() => {
    if (currentTime !== null && Math.abs(currentTime - clock.currentTime) > 1000) {
      // Only update if difference is significant (user scrubbed)
      clock.setCurrentTime(currentTime);
    }
  }, [currentTime, clock]);

  if (selectedSessionIds.length === 0) {
    return (
      <div className="w-screen h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg mb-4">No sessions selected</div>
          <Button onClick={onBack}>Go Back</Button>
        </div>
      </div>
    );
  }

  if (globalTMin === null || globalTMax === null) {
    return (
      <div className="w-screen h-screen flex items-center justify-center">
        <div className="text-lg">Loading session data...</div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col">
      {/* Map */}
      <div className="flex-1 relative">
        <ReplayMapWithData />

        {/* Boat List Panel - overlay top right */}
        <div className="absolute top-4 right-4 z-[1000]">
          <BoatListPanel />
        </div>

        {/* Top toolbar */}
        <div className="absolute top-4 left-4 z-[1000] flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            ← Back
          </Button>
          {onLogout && (
            <Button variant="outline" size="sm" onClick={onLogout}>
              Déconnexion
            </Button>
          )}
        </div>
      </div>

      {/* Replay Controls - bottom */}
      <ReplayControls />
    </div>
  );
}

