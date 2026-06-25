import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRef } from 'react';
import * as THREE from 'three';

export type CameraControllerProps = {
  targetX: number;
  targetY: number;
  targetZ: number;
};

/**
 * Orbit controls with damping; smoothly tracks the focus boat / scene centre.
 */
export function CameraController({ targetX, targetY, targetZ }: CameraControllerProps) {
  const ref = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const goal = useRef(new THREE.Vector3(targetX, targetY, targetZ));

  useFrame(() => {
    const ctrl = ref.current;
    if (!ctrl) return;
    goal.current.set(targetX, targetY, targetZ);
    ctrl.target.lerp(goal.current, 0.12);
    ctrl.update();
  });

  return (
    <OrbitControls
      ref={ref}
      enableDamping
      dampingFactor={0.078}
      minDistance={18}
      maxDistance={3200}
      maxPolarAngle={Math.PI / 2.06}
    />
  );
}
