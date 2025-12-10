export interface EmissionConfig {
  life: number;
  lifeVar: number;
  size: number;
  sizeVar: number;
  speed: number;
  speedVar: number;
  spreadDeg: number;
  gravityZ: number;
  buoyancyZ: number;
  drag: number;
  angularVar: number;
  blend: GlobalCompositeOperation;
}

export interface BaseEmitterConfig {
  name?: string;
  spawnRadius: number;
  zBias: number;
  zVar: number;
  /** Duration for continuous emission (seconds). Optional. */
  duration?: number;
  /** Rate (particles/sec) for continuous emission. Optional. */
  rate?: number;
  emission: EmissionConfig;
}

export interface PointEmitterConfig extends BaseEmitterConfig {
  type: "point";
  /** Number of particles to emit in a burst. Optional. */
  burst?: number;
}

export interface LineEmitterConfig extends BaseEmitterConfig {
  type: "line";
  burstDensity?: number;
}
