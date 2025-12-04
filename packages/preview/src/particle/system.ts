import type { EmitterConfig, Particle, StrokeSegment, Vec2 } from "./types";

const SPEED_SCALE = 5.0;

/**
 * High-performance particle system with pooling and sprite caching
 */
export class ParticleSystem {
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private spriteCache = new Map<string, HTMLCanvasElement>();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not supported");
    this.ctx = ctx;
  }

  /**
   * Get the particle canvas for rendering
   */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Resize particle canvas
   */
  public resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Preallocate particle pool
   */
  public initPool(n: number) {
    for (let i = 0; i < n; i++) {
      this.pool.push(this.createEmpty());
    }
  }

  /**
   * Get active particle count
   */
  public getActiveCount(): number {
    return this.active.length;
  }

  /**
   * Emit a burst of particles
   */
  public emitBurst(
    cfg: EmitterConfig,
    pos?: Vec2,
    stroke?: StrokeSegment,
    override: { count?: number; color?: string } = {},
  ) {
    const cnt = override.count ?? cfg.count;
    for (let i = 0; i < cnt; i++) {
      const p = this.getParticle();
      if (!p) break;

      // Randomize life
      const life = cfg.life + (Math.random() * 2 - 1) * (cfg.lifeVar ?? 0);
      p.life = life;
      p.ttl = life;
      p.size = Math.max(0.5, cfg.size + (Math.random() * 2 - 1) * (cfg.sizeVar ?? 0));
      p.color = override.color ?? cfg.color ?? "#fff";
      p.blend = cfg.blend ?? "lighter";
      p.gravity = cfg.gravity ?? 0;
      p.drag = cfg.drag ?? 0;

      // Spawn position
      if (cfg.spawnShape === "line") {
        if (!stroke) {
          throw new Error("Stroke segment required for line spawn shape");
        }
        const t = Math.random() * (cfg.spawnLength ?? 1);
        p.pos.x = stroke.x0 + (stroke.x1 - stroke.x0) * t;
        p.pos.y = stroke.y0 + (stroke.y1 - stroke.y0) * t;
      } else if (cfg.spawnShape === "alongStroke") {
        if (!stroke) {
          throw new Error("Stroke segment required for line spawn shape");
        }
        const t = Math.random();
        p.pos.x = stroke.x0 + (stroke.x1 - stroke.x0) * t;
        p.pos.y = stroke.y0 + (stroke.y1 - stroke.y0) * t;
      } else {
        if (!pos) {
          throw new Error("Emitter position required");
        }
        const spread = cfg.spawnLength ?? 6;
        p.pos.x = pos.x + (Math.random() * 2 - 1) * spread;
        p.pos.y = pos.y + (Math.random() * 2 - 1) * spread;
      }

      // Velocity
      const angleDeg = (cfg.angle ?? 0) + ((Math.random() * 2 - 1) * (cfg.spread ?? 180)) / 2;
      const angle = (angleDeg * Math.PI) / 180;
      const speed =
        Math.max(0, cfg.speed + (Math.random() * 2 - 1) * (cfg.speedVar ?? 0)) * SPEED_SCALE;
      p.vel.x = Math.cos(angle) * speed;
      p.vel.y = Math.sin(angle) * speed;
      p.rotation = Math.random() * Math.PI * 2;
      p.angularVel = (Math.random() * 2 - 1) * 2;
    }
  }

  /**
   * Update and render particles
   */
  public update(dt: number) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Update and render active particles
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!p) continue;

      p.ttl -= dt;
      if (p.ttl <= 0) {
        // Deactivate
        p.alive = false;
        this.pool.push(p);
        this.active.splice(i, 1);
        continue;
      }

      // Integrate physics
      const drag = 1 - p.drag;
      p.vel.x *= drag;
      p.vel.y *= drag;
      p.vel.y += p.gravity * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.rotation += p.angularVel * dt;

      // Render
      ctx.save();
      ctx.globalCompositeOperation = p.blend;
      const alpha = Math.max(0, Math.min(1, p.ttl / p.life));
      ctx.globalAlpha = alpha;
      const sprite = this.getSprite(p.color, p.size);
      const s = sprite.width;
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(p.rotation);
      ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  private createEmpty(): Particle {
    return {
      alive: false,
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      size: 1,
      life: 0,
      ttl: 0,
      color: "#fff",
      blend: "lighter",
      rotation: 0,
      angularVel: 0,
      gravity: 0,
      drag: 0,
    };
  }

  private getParticle(): Particle | null {
    const p = this.pool.pop();
    if (p) {
      p.alive = true;
      this.active.push(p);
      return p;
    }
    // Pool exhausted - reuse oldest
    if (this.active.length > 0) {
      const reuse = this.active.shift();
      if (reuse) {
        reuse.alive = true;
        this.active.push(reuse);
        return reuse;
      }
    }
    return null;
  }

  /**
   * Get or create cached radial gradient sprite
   */
  private getSprite(color: string, size: number): HTMLCanvasElement {
    const key = `${color}:${Math.round(size)}`;
    const cached = this.spriteCache.get(key);
    if (cached) return cached;

    const c = document.createElement("canvas");
    const s = Math.max(2, Math.round(size * 2));
    c.width = s;
    c.height = s;
    const gx = c.getContext("2d");
    if (!gx) throw new Error("Cannot create sprite context");

    const g = gx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, color);

    // Create semi-transparent middle stop
    const midColor = color.includes("rgba")
      ? color.replace(/[\d.]+\)$/, "0.45)")
      : color.replace(")", ",0.45)").replace("rgb", "rgba");
    g.addColorStop(0.5, midColor);
    g.addColorStop(1, "rgba(0,0,0,0)");

    gx.fillStyle = g;
    gx.fillRect(0, 0, s, s);
    this.spriteCache.set(key, c);
    return c;
  }

  /**
   * Clear all active particles
   */
  public clear() {
    for (const p of this.active) {
      p.alive = false;
      this.pool.push(p);
    }
    this.active.length = 0;
  }
}
