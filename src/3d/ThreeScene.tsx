import { Canvas } from '@react-three/fiber';
import { Sky, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, memo, useMemo } from 'react';
import { Sea } from './Sea';
import { Boat3D } from './Boat3D';
import { CameraController } from './CameraController';
import { CompassAzimuthBridge } from './CompassAzimuthBridge';
import type { BoatPose3D } from './replay3dTypes';

export type ThreeSceneProps = {
  boats: BoatPose3D[];
  seaHalfExtentM: number;
  cameraFocusX: number;
  cameraFocusZ: number;
  hasBoats: boolean;
  /** Camera orbit azimuth for HUD compass (throttled inside bridge). */
  onViewerAzimuth?: (rad: number) => void;
};

export const WATERLINE_Y = 0.38;

function trailToVectors(trail: Array<[number, number]>): THREE.Vector3[] {
  return trail.map(([tx, tz]) => new THREE.Vector3(tx, WATERLINE_Y + 0.02, tz));
}

const TrailLine = memo(function TrailLine({
  trail,
  color,
}: {
  trail: Array<[number, number]>;
  color: string;
}) {
  const linePts = useMemo(() => trailToVectors(trail), [trail]);
  if (linePts.length < 2) return null;
  return (
    <Line
      points={linePts}
      color={color}
      lineWidth={1.8}
      opacity={0.95}
      transparent={false}
      depthWrite={true}
    />
  );
});

function BoatsLayer({ boats }: { boats: BoatPose3D[] }) {
  return (
    <>
      {boats.map((boat) => {
        return (
          <group key={boat.sessionId} position={[0, 0, 0]}>
            <TrailLine trail={boat.trail} color={boat.color} />
            <Boat3D
              hullColor={boat.color}
              position={[boat.x, WATERLINE_Y, boat.z]}
              yawRadians={boat.yawRadians}
              boatName={boat.name}
              sogKn={boat.sogKn}
              cogDeg={boat.cogDeg}
              labelOffsetX={boat.labelOffsetX}
              labelOffsetY={boat.labelOffsetY}
              labelScreenOffsetXPx={0}
              labelScreenOffsetYPx={0}
            />
          </group>
        );
      })}
    </>
  );
}

/**
 * WebGL root: sky/fog, scaled sea, telemetry-driven boats and trails.
 */
export function ThreeScene({
  boats,
  seaHalfExtentM,
  cameraFocusX,
  cameraFocusZ,
  hasBoats,
  onViewerAzimuth,
}: ThreeSceneProps) {
  const fogNear = Math.min(140, seaHalfExtentM * 0.45 + 50);
  const fogFar = seaHalfExtentM * 4 + 900;

  const camAnchorX = hasBoats ? cameraFocusX : 0;
  const camAnchorZ = hasBoats ? cameraFocusZ : 0;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{
        position: [
          camAnchorX + seaHalfExtentM * 0.38,
          seaHalfExtentM * 0.26,
          camAnchorZ + seaHalfExtentM * 0.42,
        ],
        fov: 48,
        near: 0.5,
        far: seaHalfExtentM * 20 + 2800,
      }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <color attach="background" args={['#b8d4f2']} />
      <fog attach="fog" args={['#b8d4f2', fogNear, fogFar]} />

      <Sky sunPosition={[200, 90, 120]} turbidity={4.2} mieCoefficient={0.0045} />

      <ambientLight intensity={0.44} />
      <directionalLight
        position={[130, 200, 90]}
        intensity={1.08}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      <Sea halfExtentM={seaHalfExtentM} />

      <Suspense fallback={null}>
        <BoatsLayer boats={boats} />
      </Suspense>

      <CameraController
        targetX={hasBoats ? cameraFocusX : 0}
        targetY={WATERLINE_Y}
        targetZ={hasBoats ? cameraFocusZ : 0}
      />

      <CompassAzimuthBridge
        targetX={hasBoats ? cameraFocusX : 0}
        targetZ={hasBoats ? cameraFocusZ : 0}
        onAzimuth={onViewerAzimuth}
      />
    </Canvas>
  );
}
