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
  mainCanvas: HTMLCanvasElement;
  blossomSystem: BlossomSystem;
}

class IntroScene implements Scene<SceneCtx> {
  static BHEIGHT: number = 256;

  name: string = "intro";
  duration: number = 1.0;

  blossomImg: HTMLImageElement = new Image();
  blossomTransform: {
    x: number;
    y: number;
    sx: number;
    sy: number;
    rot: number;
    opacity: number;
  } = {
    x: 0,
    y: 0,
    sx: 1.0,
    sy: 1.0,
    rot: 0,
    opacity: 0.0,
  };

  enter(sctx: SceneCtx) {
    this.blossomImg.src = `${import.meta.env.BASE_URL}blossom-stroke.png`;
    this.blossomTransform.x = sctx.mainCanvas.width / 2;
    this.blossomTransform.y = sctx.mainCanvas.height - IntroScene.BHEIGHT / 2;
  }

  update(_dt: number, t: number, sctx: SceneCtx) {
    const POINTS = [0.1, 0.7, 1.0] as const;
    if (t < POINTS[0]) this.updateFadeIn(t / POINTS[0]);
    else if (t < POINTS[1]) this.updateMain((t - POINTS[0]) / (POINTS[1] - POINTS[0]));
    else this.updateFadeOut((t - POINTS[1]) / (POINTS[2] - POINTS[1]), sctx);
  }

  updateFadeIn(t: number) {
    this.blossomTransform.opacity = t;
  }

  updateMain(t: number) {
    this.blossomTransform.rot = (Math.floor(t * 5) / 5) * (Math.PI * 2);
    this.blossomTransform.opacity = 1.0;
  }

  updateFadeOut(t: number, sctx: SceneCtx) {
    const { height } = sctx.mainCanvas;
    const progress = easeInOut(t);
    this.blossomTransform.y = lerpf(height - IntroScene.BHEIGHT / 2, height / 2 + 64, progress); // ease to center
    const baseScale = 0.5;
    this.blossomTransform.sx = lerpf(0.5, 0.0, progress); // 0.5 -> 0.0
    this.blossomTransform.sy = lerpf(baseScale, height / IntroScene.BHEIGHT, progress);
    this.blossomTransform.rot = 0;
  }

  render(sctx: SceneCtx) {
    const ctx = sctx.mainCanvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = sctx.mainCanvas;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = this.blossomTransform.opacity;
    ctx.translate(this.blossomTransform.x, this.blossomTransform.y);
    ctx.scale(this.blossomTransform.sx, this.blossomTransform.sy);
    ctx.rotate(this.blossomTransform.rot);
    ctx.drawImage(this.blossomImg, -this.blossomImg.width / 2, -this.blossomImg.height / 2);
    // TODO: check center
    ctx.fillStyle = "rgba(255, 192, 203, 0.5)";
    ctx.fillRect(
      -this.blossomImg.width / 2,
      -this.blossomImg.height / 2,
      this.blossomImg.width,
      this.blossomImg.height,
    );
    ctx.restore();
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
    // Draw vertical lines expanding from center with bloom effect
    const ctx = sctx.mainCanvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, sctx.mainCanvas.width, sctx.mainCanvas.height);

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
            life: 2.5,
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
  duration: number = 3.0;

  update(dt: number, t: number, sctx: SceneCtx): void {
    sctx.blossomSystem.update(dt, t * this.duration);
  }
}

export const SCENES: Scene<SceneCtx>[] = [new IntroScene(), new LinesScene(), new FallScene()];
