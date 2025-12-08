import blossomSvg from "../assets/blossom.svg?raw";
import type { Vec3 } from "./utils";

const SPRITE_VARIANTS = 4;
const TEXTURE_SIZE = 64;

export class Sprite {
  constructor(private canvas: HTMLCanvasElement) {}

  public render(
    ctx: CanvasRenderingContext2D,
    pos: Vec3,
    rot: Vec3,
    screenSize: number,
    alpha: number,
  ) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";

    // Orthographic projection: x,y map directly to screen space
    // Z is used only for depth sorting and subtle size/alpha modulation
    const screenX = pos.x;
    const screenY = pos.y;

    ctx.translate(screenX, screenY);

    // 3D rotation effect via 2D transforms (pseudo-3D flipping)
    const scaleX = Math.abs(Math.cos(rot.y)) * Math.cos(rot.z);
    const scaleY = Math.abs(Math.cos(rot.x)) * Math.cos(rot.z);
    const skew = Math.sin(rot.z) * 0.3;

    const sizeScale = screenSize / TEXTURE_SIZE;
    ctx.transform(
      scaleX * sizeScale,
      skew * sizeScale,
      -skew * sizeScale,
      scaleY * sizeScale,
      0,
      0,
    );

    ctx.drawImage(this.canvas, -TEXTURE_SIZE / 2, -TEXTURE_SIZE / 2, TEXTURE_SIZE, TEXTURE_SIZE);

    ctx.restore();
  }
}

export class BlossomSpriteCollection {
  // Sprite textures (base white, cached tinted per color)
  private baseSprites: HTMLCanvasElement[] = [];

  private tintedSpriteCache = new Map<string, Sprite[]>();

  private textureLoaded = false;

  constructor() {
    const svg = blossomSvg.replace(`fill="#DE0010"`, `fill="#ccc"`); // Make base white
    loadSprite(svg, (img) => {
      // Create sprite variants with slight rotation differences
      for (let i = 0; i < SPRITE_VARIANTS; i++) {
        const canvas = document.createElement("canvas");
        canvas.width = TEXTURE_SIZE;
        canvas.height = TEXTURE_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        ctx.translate(TEXTURE_SIZE / 2, TEXTURE_SIZE / 2);
        ctx.rotate((i * Math.PI) / (SPRITE_VARIANTS * 2));
        ctx.scale(0.9 + i * 0.05, 0.9 + i * 0.05);
        ctx.drawImage(img, -TEXTURE_SIZE / 2, -TEXTURE_SIZE / 2, TEXTURE_SIZE, TEXTURE_SIZE);

        this.baseSprites.push(canvas);
      }

      this.textureLoaded = true;
    });
  }

  public get isLoaded(): boolean {
    return this.textureLoaded;
  }

  public get numVariants(): number {
    return SPRITE_VARIANTS;
  }

  /**
   * Get tinted sprites for a given color (cached)
   */
  public getTintedSprites(color: string): Sprite[] | null {
    if (!this.textureLoaded || this.baseSprites.length === 0) return null;

    const cached = this.tintedSpriteCache.get(color);
    if (cached) return cached;

    const tinted: Sprite[] = [];

    for (const baseSprite of this.baseSprites) {
      const canvas = document.createElement("canvas");
      canvas.width = TEXTURE_SIZE;
      canvas.height = TEXTURE_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      // Draw base sprite
      ctx.drawImage(baseSprite, 0, 0);

      // Apply color tint using multiply blend
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

      // Restore alpha from original
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(baseSprite, 0, 0);

      tinted.push(new Sprite(canvas));
    }

    this.tintedSpriteCache.set(color, tinted);
    return tinted;
  }

  public render() {}
}

function loadSprite(svg: string, onLoad?: (img: HTMLImageElement) => void) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    onLoad?.(img);

    URL.revokeObjectURL(url);
  };
  img.src = url;
}
