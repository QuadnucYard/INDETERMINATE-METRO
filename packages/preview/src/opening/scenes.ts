import { lerpf } from "im-shared/math";
import type { BlossomSystem } from "@/blossom/system";
import { vec3 } from "@/blossom/utils";
import { easeInOut, easeOut } from "@/easing";
import type { Scene } from "./scene";

const LINE_COLORS = [
  "#F0BE55",
  "#5C8FBD",
  "#4B9651",
  "#7857C8",
  "#89A9E7",
  "#E59CA0",
  "#CF5B20",
  "#843030",
  "#59ADAE",
  "#9CC356",
  "#31663E",
  "#D87B27",
  "#5C97FF",
];

export interface SceneCtx {
  width: number;
  height: number;

  mainCanvas: HTMLCanvasElement;
  blossomSystem: BlossomSystem;
}

class Sprite {
  img: HTMLImageElement = new Image();
  x: number = 0;
  y: number = 0;
  sx: number = 1.0;
  sy: number = 1.0;
  rot: number = 0;
  opacity: number = 1.0;
  glow: number = 0;

  constructor(public src: string) {
    this.img.src = src;
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.translate(this.x, this.y);
    ctx.scale(this.sx, this.sy);
    ctx.rotate(this.rot);

    // Draw glow effect if present - multiple layers for strong neon effect
    if (this.glow > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      // Multiple glow layers for intensity
      for (let i = 0; i < 3; i++) {
        const blur = (20 + i * 15) * this.glow;
        ctx.filter = `blur(${blur}px)`;
        ctx.globalAlpha = this.opacity * this.glow * 0.6;
        ctx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);
      }
      ctx.restore();
    }

    // Draw main image
    ctx.filter = "none";
    ctx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);
    ctx.restore();
  }
}

interface DiffusionRing {
  sprite: Sprite;
  age: number;
  life: number;
  startScale: number;
  endScale: number;
}

class IntroScene implements Scene<SceneCtx> {
  static BHEIGHT: number = 256;
  static FLASH_LOOPS: number = 3;
  static SCALE_STEPS: number[] = [0.4, 0.5, 0.6, 0.5, 0.4];
  static DIFFUSION_SPAWN_RATE: number = 0.12; // seconds between spawns
  static DIFFUSION_RING_LIFE: number = 1.2; // seconds per ring

  name: string = "intro";
  duration: number = 3.0;

  outerSprite: Sprite;
  innerLeftSprite: Sprite;
  innerRightSprite: Sprite;
  diffusionRings: DiffusionRing[] = [];
  timeSinceLastSpawn: number = 0;

  constructor() {
    this.outerSprite = new Sprite(`${import.meta.env.BASE_URL}blossom-stroke-outer.png`);
    this.innerLeftSprite = new Sprite(`${import.meta.env.BASE_URL}blossom-stroke-inner.png`);
    this.innerRightSprite = new Sprite(`${import.meta.env.BASE_URL}blossom-stroke-inner.png`);
  }

  enter(sctx: SceneCtx) {
    const { width, height } = sctx.mainCanvas;

    // Position outer sprite at bottom center
    this.outerSprite.x = width / 2;
    this.outerSprite.y = height - IntroScene.BHEIGHT / 2;
    this.outerSprite.sx = 0.5;
    this.outerSprite.sy = 0.5;
    this.outerSprite.opacity = 0;
    this.outerSprite.glow = 0;

    // Position inner sprites off-screen
    this.innerLeftSprite.x = -IntroScene.BHEIGHT;
    this.innerLeftSprite.y = height - IntroScene.BHEIGHT / 2;
    this.innerLeftSprite.sx = 0.4;
    this.innerLeftSprite.sy = 0.4;
    this.innerLeftSprite.opacity = 0;

    this.innerRightSprite.x = width + IntroScene.BHEIGHT;
    this.innerRightSprite.y = height - IntroScene.BHEIGHT / 2;
    this.innerRightSprite.sx = 0.4;
    this.innerRightSprite.sy = 0.4;
    this.innerRightSprite.opacity = 0;
  }

  update(dt: number, t: number, sctx: SceneCtx) {
    const POINTS = [0.15, 0.65, 1.0] as const;

    if (t < POINTS[0]) {
      // Phase 1: Outer fade in
      this.updateOuterFadeIn(t / POINTS[0]);
    } else if (t < POINTS[1]) {
      // Phase 2: Outer neon flashing + inner slides in
      const phaseT = (t - POINTS[0]) / (POINTS[1] - POINTS[0]);
      this.updateFlashingAndSlide(phaseT, sctx, dt);
    } else {
      // Phase 3: Merge and fade out - clear diffusion rings
      if (this.diffusionRings.length > 0) {
        this.diffusionRings = [];
      }
      const phaseT = (t - POINTS[1]) / (POINTS[2] - POINTS[1]);
      this.updateMergeAndFadeOut(phaseT, sctx);
    }
  }

  updateOuterFadeIn(t: number) {
    this.outerSprite.opacity = easeOut(t);
  }

  updateFlashingAndSlide(t: number, sctx: SceneCtx, dt: number) {
    const { width } = sctx;

    // Outer: neon flashing with discrete scaling
    this.outerSprite.opacity = 1.0;

    // Flash cycle
    const loopProgress = (t * IntroScene.FLASH_LOOPS) % 1.0;
    const flashIntensity = Math.sin(loopProgress * Math.PI * 2) * 0.5 + 0.5;
    this.outerSprite.glow = flashIntensity * 0.9;

    // Discrete scaling
    const stepIndex =
      Math.floor(t * IntroScene.FLASH_LOOPS * IntroScene.SCALE_STEPS.length) %
      IntroScene.SCALE_STEPS.length;
    const scale = IntroScene.SCALE_STEPS[stepIndex] ?? 1.0;
    this.outerSprite.sx = scale;
    this.outerSprite.sy = scale;

    // Spawn diffusion rings from center
    this.timeSinceLastSpawn += dt;
    if (this.timeSinceLastSpawn >= IntroScene.DIFFUSION_SPAWN_RATE) {
      this.spawnDiffusionRing(sctx);
      this.timeSinceLastSpawn = 0;
    }

    // Update diffusion rings
    for (let i = this.diffusionRings.length - 1; i >= 0; i--) {
      const ring = this.diffusionRings[i];
      if (!ring) continue;

      ring.age += dt;
      const progress = ring.age / ring.life;

      if (progress >= 1.0) {
        this.diffusionRings.splice(i, 1);
        continue;
      }

      // Scale grows
      ring.sprite.sx = lerpf(ring.startScale, ring.endScale, easeOut(progress));
      ring.sprite.sy = ring.sprite.sx;

      // Fade out
      ring.sprite.opacity = 1.0 - easeOut(progress);

      // Add subtle glow
      ring.sprite.glow = (1 - progress) * 0.4;
    }

    // Inner sprites slide in
    const slideProgress = easeOut(t);
    const centerX = width / 2;
    const startOffsetX = width * 0.6;

    this.innerLeftSprite.opacity = slideProgress;
    this.innerLeftSprite.x = lerpf(centerX - startOffsetX, centerX, slideProgress);

    this.innerRightSprite.opacity = slideProgress;
    this.innerRightSprite.x = lerpf(centerX + startOffsetX, centerX, slideProgress);
  }

  spawnDiffusionRing(sctx: SceneCtx) {
    const { width, height } = sctx.mainCanvas;
    const sprite = new Sprite(`${import.meta.env.BASE_URL}blossom-stroke-outer.png`);
    sprite.x = width / 2;
    sprite.y = height - IntroScene.BHEIGHT / 2;

    this.diffusionRings.push({
      sprite,
      age: 0,
      life: IntroScene.DIFFUSION_RING_LIFE,
      startScale: 0.2,
      endScale: 0.8,
    });
  }

  updateMergeAndFadeOut(t: number, sctx: SceneCtx) {
    const { width, height } = sctx.mainCanvas;
    const progress = easeInOut(t);
    const centerX = width / 2;
    const centerY = height / 2 + 64;

    // Move everything to center and scale up
    this.outerSprite.x = centerX;
    this.outerSprite.y = lerpf(height - IntroScene.BHEIGHT / 2, centerY, progress);
    this.outerSprite.sx = lerpf(0.5, 0.0, progress);
    this.outerSprite.sy = lerpf(0.5, height / IntroScene.BHEIGHT, progress);
    this.outerSprite.glow = 0;
    this.outerSprite.opacity = 1.0 - progress * 0.3;

    // Inner sprites merge and fade
    this.innerLeftSprite.x = centerX;
    this.innerLeftSprite.y = lerpf(height - IntroScene.BHEIGHT / 2, centerY, progress);
    this.innerLeftSprite.sx = lerpf(0.4, 0.0, progress);
    this.innerLeftSprite.sy = lerpf(0.4, (height / IntroScene.BHEIGHT) * 0.8, progress);
    this.innerLeftSprite.opacity = 1.0 - progress * 0.5;

    this.innerRightSprite.x = centerX;
    this.innerRightSprite.y = lerpf(height - IntroScene.BHEIGHT / 2, centerY, progress);
    this.innerRightSprite.sx = lerpf(0.4, 0.0, progress);
    this.innerRightSprite.sy = lerpf(0.4, (height / IntroScene.BHEIGHT) * 0.8, progress);
    this.innerRightSprite.opacity = 1.0 - progress * 0.5;
  }

  render(sctx: SceneCtx) {
    const ctx = sctx.mainCanvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = sctx.mainCanvas;
    ctx.clearRect(0, 0, width, height);

    // Render diffusion rings first (background layer)
    for (const ring of this.diffusionRings) {
      ring.sprite.render(ctx);
    }

    // Render in layers: inner sprites first, then outer on top
    this.innerLeftSprite.render(ctx);
    this.innerRightSprite.render(ctx);
    this.outerSprite.render(ctx);
  }
}

class LinesScene implements Scene<SceneCtx> {
  name: string = "lines-expand";
  duration: number = 1.0;

  state: {
    lineWidth: number;
    lines: { x: number; color: string }[];
    bloomIntensity: number;
  } = {
    lineWidth: 8,
    lines: [],
    bloomIntensity: 0,
  };

  enter(_sctx: SceneCtx): void {
    // We can defer line positions to update
    this.state.lines = LINE_COLORS.map((color) => ({ x: 0, color }));
  }

  leave(sctx: SceneCtx): void {
    // Hide the canvas and show blossom particles
    sctx.mainCanvas.style.display = "none";

    this.fall(sctx);
  }

  update(_dt: number, t: number, sctx: SceneCtx): void {
    this.state.bloomIntensity = 1 - easeOut(t); // Peak then fade

    this.state.lineWidth = lerpf(8, 20, easeOut(t)); // 8 -> 20

    const maxSpacing = 140;
    const expandProgress = easeOut(t); // Full duration for expansion
    const currentSpacing = maxSpacing * expandProgress;

    const lineCount = this.state.lines.length;
    const centerX = sctx.mainCanvas.width / 2;
    this.state.lines.forEach((line, i) => {
      const offsetX = (i - (lineCount - 1) / 2) * currentSpacing;
      line.x = centerX + offsetX;
    });
  }

  render(sctx: SceneCtx): void {
    const { width, height } = sctx;

    // Draw vertical lines expanding from center with bloom effect
    const ctx = sctx.mainCanvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const { lineWidth, bloomIntensity } = this.state;

    for (const line of this.state.lines) {
      const x = line.x;

      // Draw base line
      ctx.strokeStyle = line.color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, sctx.mainCanvas.height);
      ctx.stroke();

      // Draw bloom (white glow)
      if (bloomIntensity > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(255, 255, 255, ${bloomIntensity * 0.8})`;
        ctx.lineWidth = lineWidth + 8 * bloomIntensity;
        ctx.filter = `blur(${12 * bloomIntensity}px)`;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, sctx.mainCanvas.height);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  fall(sctx: SceneCtx): void {
    const { blossomSystem } = sctx;

    const { height } = blossomSystem.getCanvas();

    // Disable wind for controlled attraction effect
    blossomSystem.setWind({
      base: vec3(0, 0, 0),
      gustStrength: 0,
      gustFrequency: 0,
      turbulence: 0,
    });

    const particleCountPerLine = 200;
    for (const line of this.state.lines) {
      // Create particles along the line
      for (let j = 0; j < particleCountPerLine; j++) {
        const pos = vec3(
          line.x + (Math.random() - 0.5) * 5,
          (j / particleCountPerLine) * height,
          (Math.random() - 0.5) * 50,
        );

        blossomSystem.spawnParticle(
          {
            life: 4.0,
            lifeVar: 0.5,
            size: 24,
            sizeVar: 8,
            speed: 48,
            speedVar: 16,
            spreadDeg: 120,
            gravityZ: 0,
            buoyancyZ: 0,
            drag: 0.96,
            angularVar: 2.6,
            blend: "lighter",
          },
          pos,
          line.color,
        );
      }
    }

    sctx.blossomSystem = blossomSystem;
  }
}

class FallScene implements Scene<SceneCtx> {
  name: string = "falling-particles";
  duration: number = 4.0;

  update(dt: number, t: number, sctx: SceneCtx): void {
    const { width, height } = sctx;

    // Transition from repulsion to attraction
    const TRANSITION_POINT = 0.2; // 20% into the scene

    const centerX = width / 2;
    const centerY = height / 2;
    const centerZ = 500; // Mid-depth in z-space

    if (t < TRANSITION_POINT) {
      // Repulsion phase - push particles apart strongly
      const repulsionStrength = lerpf(-2500, -500, t / TRANSITION_POINT);
      sctx.blossomSystem.setCentralForce(vec3(centerX, centerY, centerZ), repulsionStrength, 2000);
    } else {
      // Attraction phase - pull particles to center with strong eased force
      const attractionProgress = (t - TRANSITION_POINT) / (1.0 - TRANSITION_POINT);
      const attractionStrength = lerpf(0, 6000, easeInOut(attractionProgress));
      sctx.blossomSystem.setCentralForce(vec3(centerX, centerY, centerZ), attractionStrength, 2000);
    }

    sctx.blossomSystem.update(dt, t * this.duration);
  }

  leave(sctx: SceneCtx): void {
    // Disable central force when leaving
    sctx.blossomSystem.clearCentralForce();
  }
}

export const SCENES: Scene<SceneCtx>[] = [new IntroScene(), new LinesScene(), new FallScene()];
