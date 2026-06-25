/** Serialized pose for R3F (plain data from React). */
export type BoatPose3D = {
  sessionId: string;
  name: string;
  color: string;
  x: number;
  z: number;
  yawRadians: number;
  sogKn: number | null;
  cogDeg: number;
  /** Anti-overlap world offsets for label anchoring. */
  labelOffsetX: number;
  labelOffsetY: number;
  /** Monotonic timestamp used to skip expensive trail updates on each clock tick. */
  t: number;
  /** Trail polyline in local metres (horizontal x, z). */
  trail: Array<[number, number]>;
};
