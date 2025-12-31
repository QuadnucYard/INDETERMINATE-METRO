// ============================================================================
// Particle definition
// ============================================================================

import { CanvasRenderer } from "../canvas-renderer";
import type { Rect } from "../types";
import type { EmissionConfig } from "./config";
import type { Emitter } from "./emitter";
import type { Blossom } from "./particle";
import { BlossomSpriteCollection } from "./sprite";
import { randomUnitVectorInCone, type Vec3, vec3, vec3Mag, zeroVec3 } from "./utils";

// ============================================================================
// Wind configuration
// ============================================================================

interface WindConfig {
  base: Readonly<Vec3>;
  gustStrength: number;
  gustFrequency: number;
  turbulence: number;
}

const DEFAULT_WIND: WindConfig = {
  base: vec3(15, -5, 0), // Gentle breeze from left, slight upward
  gustStrength: 40,
  gustFrequency: 0.3,
  turbulence: 8,
};

interface CentralForceConfig {
  center: Readonly<Vec3>;
  strength: number; // positive = attraction, negative = repulsion
  maxDistance: number;
}

// ============================================================================
// Depth configuration (for orthographic projection)
// ============================================================================

// Z range for depth sorting and alpha modulation
const DEPTH_RANGE = { near: -200, far: 400 };

// ============================================================================
// Blossom Particle System
// ============================================================================

const MARGIN_RATIO = 0.25; // 25% of size
const MAX_PARTICLES = 3000;

export class BlossomSystem extends CanvasRenderer {
  private pool: Blossom[] = [];
  private active: Blossom[] = [];

  private emitters: Emitter[] = [];

  private sprites: BlossomSpriteCollection;

  // Wind state
  private wind: Readonly<WindConfig> = DEFAULT_WIND;
  private currentGust: Vec3 = zeroVec3();

  // Central force (for special effects)
  private centralForce?: CentralForceConfig;

  // World bounds (in reference coordinate space, same as metro canvas)
  private bounds = { minX: -100, maxX: 2100, minY: -200, maxY: 1200 };

  // Default color
  private defaultColor = "#DE0010";

  constructor() {
    super();

    this.sprites = new BlossomSpriteCollection();
  }

  /**
   * Resize the canvas and update bounds
   * @param rect The new size of the canvas
   * @param refRect The reference coordinate space of content
   */
  public override resize(rect: Rect, refRect: Rect) {
    super.resize(rect, refRect);

    // Update bounds to match reference coordinate space
    this.bounds = {
      minX: refRect.width * -MARGIN_RATIO,
      maxX: refRect.width * (1 + MARGIN_RATIO),
      minY: refRect.height * -MARGIN_RATIO,
      maxY: refRect.height * (1 + MARGIN_RATIO),
    };
  }

  public initPool(n: number) {
    const count = Math.min(n, MAX_PARTICLES);
    for (let i = 0; i < count; i++) {
      this.pool.push(this.createEmpty());
    }
  }

  public getActiveCount(): number {
    return this.active.length;
  }

  public setWind(config: Partial<WindConfig>) {
    Object.assign(this.wind, config);
  }

  public setCentralForce(center: Vec3, strength: number, maxDistance = 1000) {
    this.centralForce = {
      center,
      strength,
      maxDistance,
    };
  }

  public clearCentralForce() {
    this.centralForce = undefined;
  }

  public addEmitter(emitter: Emitter) {
    this.emitters.push(emitter);
    emitter.start();
  }

  public getEmitters(): Emitter[] {
    return this.emitters;
  }

  /**
   * Emit a single particle (used for continuous emission)
   */
  public spawnParticle(cfg: EmissionConfig, pos: Vec3, color: string) {
    const p = this.getParticle();
    if (!p) return;

    // Position
    p.pos.x = pos.x;
    p.pos.y = pos.y;
    p.pos.z = pos.z;

    // Velocity in spherical cone
    const dir = randomUnitVectorInCone(cfg.spreadDeg, 0.6);
    const speed = cfg.speed + (Math.random() * 2 - 1) * cfg.speedVar;
    p.vel.x = dir.x * speed;
    p.vel.y = dir.y * speed;
    p.vel.z = dir.z * speed;

    // Life
    p.life = cfg.life + (Math.random() * 2 - 1) * cfg.lifeVar;
    p.ttl = p.life;

    // Size
    p.size = cfg.size + (Math.random() * 2 - 1) * cfg.sizeVar;

    // Mass
    p.mass = 0.5 + Math.random() * 0.5;

    // Initial rotation
    p.rot.x = Math.random() * Math.PI * 2;
    p.rot.y = Math.random() * Math.PI * 2;
    p.rot.z = Math.random() * Math.PI * 2;

    // Angular velocity
    p.spin.x = (Math.random() * 2 - 1) * cfg.angularVar;
    p.spin.y = (Math.random() * 2 - 1) * cfg.angularVar;
    p.spin.z = (Math.random() * 2 - 1) * cfg.angularVar * 1.5;

    p.color = color;
    p.spriteId = Math.floor(Math.random() * this.sprites.numVariants);
  }

  /**
   * Main update loop: physics + render
   */
  public update(dt: number, time: number) {
    if (!this.sprites.isLoaded) return;

    // Cap dt to prevent explosion on tab switch
    dt = Math.min(dt, 0.1);

    // Update
    this.updateEmitters(dt);
    this.updateWind(dt);
    this.updateParticles(dt, time);

    // Render
    this.renderParticles();
  }

  private updateEmitters(dt: number) {
    let i = 0;
    while (i < this.emitters.length) {
      const emitter = this.emitters[i];
      if (!emitter) {
        i++;
        continue;
      }
      emitter.update(dt);
      if (emitter.isFinished()) {
        this.emitters.splice(i, 1);
        continue;
      }
      i++;
    }
  }

  private updateWind(dt: number) {
    // Generate new gust periodically
    if (Math.random() < this.wind.gustFrequency * dt) {
      this.currentGust.x = (Math.random() - 0.3) * this.wind.gustStrength;
      this.currentGust.y = (Math.random() - 0.5) * this.wind.gustStrength * 0.3;
      this.currentGust.z = (Math.random() - 0.5) * this.wind.gustStrength * 0.5;
    }

    // Decay gust
    const decay = 0.98;
    this.currentGust.x *= decay;
    this.currentGust.y *= decay;
    this.currentGust.z *= decay;
  }

  private updateParticles(dt: number, time: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!p) continue;

      p.ttl -= dt;
      if (p.ttl <= 0) {
        this.recycleParticle(p, i);
        continue;
      }

      // Physics
      this.applyPhysics(p, dt, time);

      // Bounds check
      if (this.shouldDespawn(p)) {
        this.recycleParticle(p, i);
      }
    }
  }

  private shouldDespawn(p: Blossom): boolean {
    return (
      p.pos.x < this.bounds.minX ||
      p.pos.x > this.bounds.maxX ||
      p.pos.y < this.bounds.minY ||
      p.pos.y > this.bounds.maxY
    );
  }

  private applyPhysics(p: Blossom, dt: number, time: number) {
    // Physics constants
    const physGravityZ = 6;
    const physBuoyancyZ = 28;
    const physDrag = 0.985;

    // Wind influence (inversely proportional to mass)
    const windFactor = 1 / p.mass;

    // Turbulence
    const turbX = Math.sin(time * 2 + p.pos.x * 0.01) * this.wind.turbulence;
    const turbY = Math.cos(time * 1.5 + p.pos.y * 0.01) * this.wind.turbulence * 0.5;
    const turbZ = Math.sin(time * 1.8 + p.pos.z * 0.01) * this.wind.turbulence * 0.3;

    // Total wind force
    const windX = (this.wind.base.x + this.currentGust.x + turbX) * windFactor;
    const windY = (this.wind.base.y + this.currentGust.y + turbY) * windFactor;
    const windZ = (this.wind.base.z + this.currentGust.z + turbZ) * windFactor;

    // Apply wind acceleration
    p.vel.x += windX * dt;
    p.vel.y += windY * dt;
    p.vel.z += windZ * dt;

    // Gravity (positive Y is down)
    const gravity = physGravityZ * (p.size / 12);
    p.vel.y += gravity * dt;

    // Buoyancy
    const buoyancy = (physBuoyancyZ / p.mass) * 0.5;
    p.vel.y -= buoyancy * dt;
    p.vel.z += buoyancy * dt * 0.3;

    // Drag
    p.vel.x *= physDrag;
    p.vel.y *= physDrag;
    p.vel.z *= physDrag;

    // Central force (attraction/repulsion)
    if (this.centralForce) {
      const { center, strength, maxDistance } = this.centralForce;

      const dx = center.x - p.pos.x;
      const dy = center.y - p.pos.y;
      const dz = center.z - p.pos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(distSq);

      if (dist > 0.1) {
        // Always affect all particles (no max distance check)
        // Use linear falloff with minimum strength to prevent close particles from being blown too easily
        // Far particles still get affected due to the base strength
        const distanceFactor = Math.min(dist / maxDistance, 1.0);
        const baseStrength = strength * 0.5; // Minimum 50% strength even at distance
        const forceMag = baseStrength + strength * 0.5 * (1 - distanceFactor);

        p.vel.x += (dx / dist) * forceMag * dt;
        p.vel.y += (dy / dist) * forceMag * dt;
        p.vel.z += (dz / dist) * forceMag * dt;
      }
    }

    // Flutter effect
    const flutter = Math.sin(p.rot.x * 2 + p.rot.z) * 15 * (1 / p.mass);
    p.vel.y += flutter * dt * 0.5;

    // Update position
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.z += p.vel.z * dt;

    // Update rotation
    const speedFactor = vec3Mag(p.vel) * 0.01;
    p.rot.x += p.spin.x * dt * (1 + speedFactor);
    p.rot.y += p.spin.y * dt * (1 + speedFactor);
    p.rot.z += p.spin.z * dt * (1 + speedFactor * 0.5);

    // Wind affects spin
    p.spin.z += windX * 0.02 * dt;
    p.spin.x += windY * 0.01 * dt;
  }

  private renderParticles() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.setTransform(this.pixelRatio * this.scale, 0, 0, this.pixelRatio * this.scale, 0, 0);
    ctx.globalCompositeOperation = "lighter";

    // Sort by depth (far to near for painter's algorithm)
    this.active.sort((a, b) => a.pos.z - b.pos.z);

    // Render each particle
    for (const p of this.active) {
      this.renderParticle(p, ctx);
    }

    ctx.restore();
  }

  private renderParticle(p: Blossom, ctx: CanvasRenderingContext2D) {
    // Get tinted sprites
    const sprites = this.sprites.getTintedSprites(p.color);
    if (!sprites || sprites.length === 0) return;

    const sprite = sprites[p.spriteId % sprites.length];
    if (!sprite) return;

    // Subtle depth-based size modulation (closer = slightly larger)
    const depthNorm = (p.pos.z - DEPTH_RANGE.near) / (DEPTH_RANGE.far - DEPTH_RANGE.near);
    const depthScale = 1.0 + (1 - depthNorm) * 0.15; // 1.0 to 1.15
    const screenSize = p.size * depthScale;

    if (screenSize < 1) return;

    // Depth-based alpha (farther = more transparent)
    const depthAlpha = Math.max(0.3, Math.min(1, 1 - depthNorm * 0.5));
    // Life-based alpha (fade out near end)
    const lifeAlpha = p.ttl > 0.3 ? 1 : p.ttl / 0.3;
    const alpha = depthAlpha * lifeAlpha * 0.9;

    sprite.render(ctx, p.pos, p.rot, screenSize, alpha, this.pixelRatio * this.scale);
  }

  private createEmpty(): Blossom {
    return {
      alive: false,
      pos: zeroVec3(),
      vel: zeroVec3(),
      rot: zeroVec3(),
      spin: zeroVec3(),
      size: 12,
      life: 0,
      ttl: 0,
      mass: 1,
      color: this.defaultColor,
      spriteId: 0,
    };
  }

  private getParticle(): Blossom | null {
    const p = this.pool.pop();
    if (p) {
      p.alive = true;
      this.active.push(p);
      return p;
    }

    if (this.active.length >= MAX_PARTICLES && this.active.length > 0) {
      const reuse = this.active.shift();
      if (reuse) {
        reuse.alive = true;
        this.active.push(reuse);
        return reuse;
      }
    }

    if (this.active.length < MAX_PARTICLES) {
      const newP = this.createEmpty();
      newP.alive = true;
      this.active.push(newP);
      return newP;
    }

    return null;
  }

  private recycleParticle(p: Blossom, index: number) {
    p.alive = false;
    this.pool.push(p);
    this.active.splice(index, 1);
  }

  public clear() {
    for (const p of this.active) {
      p.alive = false;
      this.pool.push(p);
    }
    this.active.length = 0;
  }

  /**
   * Apply a custom force to all active particles
   */
  public applyForce(forceFn: (pos: Vec3, vel: Vec3) => Vec3) {
    for (const p of this.active) {
      const force = forceFn(p.pos, p.vel);
      p.vel.x += force.x;
      p.vel.y += force.y;
      p.vel.z += force.z;
    }
  }

  /**
   * Trigger a strong gust of wind
   */
  public triggerGust(strength: number = 1) {
    this.currentGust.x = (Math.random() - 0.2) * this.wind.gustStrength * strength * 2;
    this.currentGust.y = (Math.random() - 0.6) * this.wind.gustStrength * strength;
    this.currentGust.z = (Math.random() - 0.5) * this.wind.gustStrength * strength;
  }
}
