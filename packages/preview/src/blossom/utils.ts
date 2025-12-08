// ============================================================================
// Vector types
// ============================================================================

export type Vec3 = { x: number; y: number; z: number };

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const zeroVec3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });

export const vec3Mag = (v: Vec3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
