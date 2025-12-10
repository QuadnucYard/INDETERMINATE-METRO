import type { Vec3 } from "./utils";

export interface Blossom {
  alive: boolean;
  pos: Vec3;
  vel: Vec3;
  rot: Vec3; // Euler angles
  spin: Vec3; // Angular velocity
  size: number;
  life: number;
  ttl: number;
  mass: number;
  color: string;
  spriteId: number;
}
