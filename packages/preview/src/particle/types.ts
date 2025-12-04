// Particle system types and configs

export interface Vec2 {
  x: number;
  y: number;
}

export interface Particle {
  alive: boolean;
  pos: Vec2;
  vel: Vec2;
  size: number;
  life: number;
  ttl: number;
  color: string;
  blend: GlobalCompositeOperation;
  rotation: number;
  angularVel: number;
  gravity: number;
  drag: number;
}

export interface EmitterConfig {
  name: string;
  emitMode: "burst" | "pulse" | "continuous";
  count: number;
  life: number;
  lifeVar?: number;
  size: number;
  sizeVar?: number;
  speed: number;
  speedVar?: number;
  angle?: number; // degrees
  spread?: number; // degrees
  gravity?: number;
  drag?: number;
  alpha?: number;
  color?: string;
  blend?: GlobalCompositeOperation;
  spawnShape?: "point" | "line" | "alongStroke";
  spawnLength?: number;
  followStroke?: boolean;
  easeFn?: "cosine" | "linear";
}

export interface StrokeSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
