import { lerp } from "im-shared/math";
import type { Vec2 } from "im-shared/types";
import type { Vec2Ref } from "../types";
import type { BaseEmitterConfig, LineEmitterConfig, PointEmitterConfig } from "./config";
import type { BlossomSystem } from "./system";
import type { Vec3 } from "./utils";

export abstract class Emitter {
  private started: boolean = false;
  private remainingTime: number = 0;
  private timeSinceLastEmit: number = 0;

  constructor(protected cfg: BaseEmitterConfig) {
    this.remainingTime = this.cfg.duration ?? 0.0;
  }

  public start() {}

  protected get rate(): number {
    return this.cfg.rate ?? 0;
  }

  public update(dt: number) {
    if (!this.started) {
      this.started = true;
      this.burst();
    }

    if (!this.cfg.rate) {
      this.kill();
      return;
    }

    this.remainingTime -= dt;
    if (this.remainingTime <= 0) return;

    // Calculate how many particles to emit
    const interval = 1 / this.rate;
    this.timeSinceLastEmit += dt;

    while (this.timeSinceLastEmit >= interval) {
      this.emit();
      this.timeSinceLastEmit -= interval;
    }
  }

  protected abstract burst(): void;

  protected emitMany(count: number) {
    for (let i = 0; i < count; i++) {
      this.emit();
    }
  }

  protected abstract emit(): void;

  protected kill() {
    this.remainingTime = 0;
  }

  public isFinished() {
    return this.remainingTime <= 0;
  }
}

export class PointEmitter extends Emitter {
  constructor(
    private system: BlossomSystem,
    override cfg: PointEmitterConfig,
    private pos: Vec2Ref,
    private color: string,
  ) {
    super(cfg);
  }

  protected override burst() {
    this.emitMany(this.cfg.burst ?? 0);
  }

  protected override emit() {
    if (!this.pos.val) {
      return;
    }

    // Spawn position with spread
    const pos = randomEmissionPos(
      this.pos.val,
      this.cfg.spawnRadius,
      this.cfg.zBias,
      this.cfg.zVar,
    );
    this.system.spawnParticle(this.cfg.emission, pos, this.color);
  }
}

export class LineEmitter extends Emitter {
  private length: number = 0;

  constructor(
    private system: BlossomSystem,
    override cfg: LineEmitterConfig,
    private pos1: Vec2Ref,
    private pos2: Vec2Ref,
    private color: string,
  ) {
    super(cfg);
  }

  protected override get rate(): number {
    // Use configured rate scaled by line length
    return (this.cfg.rate ?? 0) * this.length;
  }

  public override update(dt: number): void {
    this.updateLength();
    super.update(dt);
  }

  private updateLength() {
    if (!this.pos1.val || !this.pos2.val) {
      this.length = 0;
      return;
    }

    const dx = this.pos2.val.x - this.pos1.val.x;
    const dy = this.pos2.val.y - this.pos1.val.y;
    this.length = Math.sqrt(dx * dx + dy * dy);
  }

  protected override burst() {
    this.emitMany(Math.floor((this.cfg.burstDensity ?? 0) * this.length));
  }

  protected override emit() {
    if (!this.pos1.val || !this.pos2.val) {
      return;
    }

    // Sample a random point along the line segment
    const t = Math.random();
    const linePos = lerp(this.pos1.val, this.pos2.val, t);

    // Spawn position with spread
    const pos = randomEmissionPos(linePos, this.cfg.spawnRadius, this.cfg.zBias, this.cfg.zVar);
    this.system.spawnParticle(this.cfg.emission, pos, this.color);
  }
}

export class PolylineEmitter extends Emitter {
  private segmentLengths: number[] = [];
  private totalLength: number = 0;

  constructor(
    private system: BlossomSystem,
    override cfg: LineEmitterConfig,
    private segments: { start: Vec2Ref; end: Vec2Ref }[],
    private color: string,
  ) {
    super(cfg);
  }

  public override update(dt: number): void {
    this.updateSegmentLengths();
    super.update(dt);
  }

  private updateSegmentLengths() {
    this.segmentLengths = this.segments.map((seg) => {
      if (!seg.start.val || !seg.end.val) return 0;
      const dx = seg.end.val.x - seg.start.val.x;
      const dy = seg.end.val.y - seg.start.val.y;
      return Math.sqrt(dx * dx + dy * dy);
    });
    this.totalLength = this.segmentLengths.reduce((a, b) => a + b, 0);
  }

  protected override burst() {
    this.emitMany(Math.floor((this.cfg.burstDensity ?? 0) * this.totalLength));
  }

  protected override emit() {
    const linePos = this.sampleEmissionPoint();
    if (!linePos) {
      return;
    }

    // Spawn position with spread
    const pos = randomEmissionPos(linePos, this.cfg.spawnRadius, this.cfg.zBias, this.cfg.zVar);
    this.system.spawnParticle(this.cfg.emission, pos, this.color);
  }

  private sampleEmissionPoint(): Vec2 | undefined {
    let r = Math.random() * this.totalLength;

    // Find which segment to sample from
    let chosenSegment: { start: Vec2Ref; end: Vec2Ref } | undefined;
    for (let i = 0; i < this.segments.length; i++) {
      const segLen = this.segmentLengths[i] as number;
      if (r <= segLen) {
        chosenSegment = this.segments[i];
        break;
      }
      r -= segLen;
    }
    if (!chosenSegment || !chosenSegment.start.val || !chosenSegment.end.val) {
      return;
    }

    // Sample a random point along the line segment
    const t = Math.random();
    const linePos = lerp(chosenSegment.start.val, chosenSegment.end.val, t);

    return linePos;
  }
}

function randomEmissionPos(pos: Vec2, spread: number, zBias: number, zVar: number): Vec3 {
  return {
    x: pos.x + (Math.random() * 2 - 1) * spread,
    y: pos.y + (Math.random() * 2 - 1) * spread,
    z: zBias + (Math.random() * 2 - 1) * zVar,
  };
}
