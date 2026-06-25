import { useMemo, useRef } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type Boat3DProps = {
  position: [number, number, number];
  /** Y-axis rotation (radians); mesh forward is +X after rotation. */
  yawRadians: number;
  hullColor: string;
  boatName: string;
  sogKn: number | null;
  cogDeg: number;
  labelOffsetX: number;
  labelOffsetY: number;
  labelScreenOffsetXPx: number;
  labelScreenOffsetYPx: number;
};

const MODEL_PATH = '/models/boats/mon-bateau.glb';
// Temporary fit values; adjust after visual check of source model orientation/units.
const MODEL_SCALE = 30;
const MODEL_Y_OFFSET = 0;
// Orientation calibration for this GLB.
// Keep these explicit so you can tune quickly without touching telemetry math.
const MODEL_YAW_OFFSET_DEG = 0; // Try 0, 90, 180, 270 depending on model forward axis.
const MODEL_YAW_SIGN: 1 | -1 = 1; // Set -1 if headings are mirrored.
// Single knob for the race label size (1 = current size).
const LABEL_UI_SCALE = 0.8;
// Base world offset above hull.
const LABEL_Y_OFFSET_BASE = Math.max(MODEL_SCALE * 3);
// Extra lift based on camera distance so the label stays visually above when zooming out.
const LABEL_ZOOM_FACTOR = 0.07;

/**
 * Renders uploaded GLB boat model.
 */
export function Boat3D({
  position,
  yawRadians,
  hullColor,
  boatName,
  sogKn,
  cogDeg,
  labelOffsetX,
  labelOffsetY,
  labelScreenOffsetXPx,
  labelScreenOffsetYPx,
}: Boat3DProps) {
  const { camera } = useThree();
  const labelAnchorRef = useRef<THREE.Group>(null);
  const tmpBoatPosRef = useRef(new THREE.Vector3());
  const gltf = useGLTF(MODEL_PATH);
  const model = useMemo(() => {
    const tint = new THREE.Color(hullColor);
    const scene = gltf.scene.clone(true);

    const applyMaterialTint = (material: THREE.Material): THREE.Material => {
      const cloned = material.clone() as THREE.Material & {
        color?: THREE.Color;
        map?: THREE.Texture | null;
        emissiveMap?: THREE.Texture | null;
        aoMap?: THREE.Texture | null;
        metalness?: number;
        roughness?: number;
        needsUpdate?: boolean;
      };

      if (cloned.color instanceof THREE.Color) {
        // Hard override: boat color fully matches session color.
        cloned.color.copy(tint);
      }

      // Remove maps that usually dominate final color.
      if ('map' in cloned) cloned.map = null;
      if ('emissiveMap' in cloned) cloned.emissiveMap = null;
      if ('aoMap' in cloned) cloned.aoMap = null;

      // Keep a clean, readable look.
      if (typeof cloned.metalness === 'number') cloned.metalness = 0.2;
      if (typeof cloned.roughness === 'number') cloned.roughness = 0.5;
      cloned.needsUpdate = true;

      return cloned;
    };

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      mesh.castShadow = false;
      mesh.receiveShadow = true;

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => applyMaterialTint(m));
      } else if (mesh.material) {
        mesh.material = applyMaterialTint(mesh.material);
      }
    });

    return scene;
  }, [gltf.scene, hullColor]);

  useFrame(() => {
    const anchor = labelAnchorRef.current;
    if (!anchor) return;
    tmpBoatPosRef.current.set(position[0], position[1], position[2]);
    const dist = camera.position.distanceTo(tmpBoatPosRef.current);
    const dynamicY = Math.min(
      LABEL_Y_OFFSET_BASE * 3,
      Math.max(LABEL_Y_OFFSET_BASE * 0.75, LABEL_Y_OFFSET_BASE + dist * LABEL_ZOOM_FACTOR)
    );
    anchor.position.set(labelOffsetX, dynamicY + labelOffsetY, 0);
  });

  return (
    <group
      position={position}
      rotation={[
        0,
        MODEL_YAW_SIGN * yawRadians + (MODEL_YAW_OFFSET_DEG * Math.PI) / 180,
        0,
      ]}
    >
      <primitive
        object={model}
        scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]}
        position={[0, MODEL_Y_OFFSET, 0]}
      />
      <group ref={labelAnchorRef} position={[0, LABEL_Y_OFFSET_BASE, 0]}>
        <Html
          position={[0, 0, 0]}
          center
          sprite
          occlude={false}
          transform={false}
        >
          <div
            style={{
              transform: `translate(${labelScreenOffsetXPx}px, ${labelScreenOffsetYPx}px)`,
              transition: 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
              minWidth: `${Math.round(150 * LABEL_UI_SCALE)}px`,
              borderRadius: 10 * LABEL_UI_SCALE,
              border: `1px solid ${hullColor}`,
              background: 'rgba(15, 23, 42, 0.52)',
              color: '#e2e8f0',
              boxShadow: '0 6px 14px rgba(2, 6, 23, 0.30)',
              backdropFilter: 'blur(2px)',
              overflow: 'hidden',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            <div
              style={{
                background: hullColor,
                color: '#0f172a',
                fontWeight: 800,
                letterSpacing: 0.3,
                padding: `${Math.round(4 * LABEL_UI_SCALE)}px ${Math.round(10 * LABEL_UI_SCALE)}px`,
                fontSize: `${Math.max(10, Math.round(12 * LABEL_UI_SCALE))}px`,
                textTransform: 'uppercase',
              }}
            >
              {boatName}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: Math.round(10 * LABEL_UI_SCALE),
                padding: `${Math.round(6 * LABEL_UI_SCALE)}px ${Math.round(10 * LABEL_UI_SCALE)}px`,
                fontSize: `${Math.max(10, Math.round(12 * LABEL_UI_SCALE))}px`,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              <span>SOG {sogKn !== null ? `${sogKn.toFixed(1)} kn` : '--'}</span>
              <span>COG {Math.round(cogDeg)}°</span>
            </div>
          </div>
        </Html>
      </group>
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
