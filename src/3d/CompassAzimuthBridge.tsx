import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

export type CompassAzimuthBridgeProps = {
  targetX: number;
  targetZ: number;
  onAzimuth?: (rad: number) => void;
};

const EMIT_INTERVAL_MS = 72;

/**
 * Samples camera orbit azimuth (throttled) for a screen-space north compass.
 */
export function CompassAzimuthBridge({ targetX, targetZ, onAzimuth }: CompassAzimuthBridgeProps) {
  const lastEmit = useRef(0);

  useFrame(({ camera }) => {
    if (!onAzimuth) return;
    const now = performance.now();
    if (now - lastEmit.current < EMIT_INTERVAL_MS) return;
    lastEmit.current = now;

    const vx = camera.position.x - targetX;
    const vz = camera.position.z - targetZ;
    onAzimuth(Math.atan2(vx, vz));
  });

  return null;
}
