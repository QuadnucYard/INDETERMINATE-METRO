import type { Vec2 } from "./types";

export function midpoint(p1: Vec2, p2: Vec2): Vec2 {
  return { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
}

export function lerp(p1: Vec2, p2: Vec2, t: number): Vec2 {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
  };
}
