// ============================================================================
// Vector types
// ============================================================================

export type Vec3 = { x: number; y: number; z: number };

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const zeroVec3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });

export const vec3Mag = (v: Vec3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

/**
 * Generate a random unit vector within a cone
 * @param spreadDeg Half-angle of cone in degrees
 * @param upwardBias Bias toward negative Y (upward on screen)
 */
export function randomUnitVectorInCone(
  spreadDeg: number,
  upwardBias: number = 0.3,
): Readonly<Vec3> {
  const spreadRad = (spreadDeg * Math.PI) / 180;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(1 - Math.random() * (1 - Math.cos(spreadRad)));

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);

  const x = sinPhi * Math.cos(theta);
  const y = -cosPhi * upwardBias + sinPhi * Math.sin(theta) * (1 - upwardBias);
  const z = sinPhi * Math.sin(theta) * 0.5 + cosPhi * (1 - upwardBias);

  const mag = Math.sqrt(x * x + y * y + z * z);
  return vec3(x / mag, y / mag, z / mag);
}
