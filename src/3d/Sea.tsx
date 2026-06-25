import { Grid } from '@react-three/drei';

export type SeaProps = {
  /** Half-width / half-depth of the square patch (metres). */
  halfExtentM: number;
};

/**
 * Large water surface with depth tint and a light navigation grid.
 */
export function Sea({ halfExtentM }: SeaProps) {
  const size = Math.max(halfExtentM * 2, 160);
  const cell = Math.max(8, halfExtentM * 0.06);
  const section = cell * 5;
  const gridY = 0.12;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow renderOrder={0}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial
          color="#0e4c72"
          roughness={0.35}
          metalness={0.05}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>

      <Grid
        args={[size, size]}
        position={[0, gridY, 0]}
        cellSize={cell}
        cellThickness={0.35}
        cellColor="#6b93b8"
        sectionSize={section}
        sectionThickness={0.75}
        sectionColor="#94b8d9"
        fadeDistance={size * 0.85}
        fadeStrength={1.15}
        infiniteGrid={false}
        renderOrder={1}
      />
    </group>
  );
}
