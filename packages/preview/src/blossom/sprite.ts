import blossomSvg from "../assets/blossom.svg?raw";
import type { Vec3 } from "./utils";

const SPRITE_VARIANTS: number = 6;
const TEXTURE_SIZE: number = 64;
const DPR: number = window.devicePixelRatio || 1;

export class Sprite {
  constructor(
    private atlas: HTMLCanvasElement,
    private sx: number,
    private sy: number,
    private sw: number,
    private sh: number,
  ) {}

  public render(
    ctx: CanvasRenderingContext2D,
    pos: Vec3,
    rot: Vec3,
    size: number,
    alpha: number,
    globalScale: number,
  ) {
    // We avoid save/restore for performance; caller must handle it
    ctx.globalAlpha = alpha;

    // 3D rotation effect via 2D transforms (pseudo-3D flipping)
    const scaleX = Math.abs(Math.cos(rot.y)) * Math.cos(rot.z);
    const scaleY = Math.abs(Math.cos(rot.x)) * Math.cos(rot.z);
    const skew = Math.sin(rot.z) * 0.3;

    // Apply globalScale to the sprite size so sprites respect renderer scaling.
    const sizeScale = (size / TEXTURE_SIZE) * globalScale;
    ctx.setTransform(
      scaleX * sizeScale,
      skew * sizeScale,
      -skew * sizeScale,
      scaleY * sizeScale,
      pos.x * globalScale,
      pos.y * globalScale,
    );

    ctx.drawImage(
      this.atlas,
      this.sx,
      this.sy,
      this.sw,
      this.sh,
      -this.sw / 2,
      -this.sh / 2,
      this.sw,
      this.sh,
    );
  }
}

export class BlossomSpriteCollection {
  // Base sprite canvases (rotated variants)
  private baseSprites: HTMLCanvasElement[] = [];

  // Tinted sprite cache: per color we store the allocated sprite objects
  private tintedSpriteCache = new Map<string, Sprite[]>();

  // Atlas allocator: fixed-size pages. Each page is subdivided into uniform tiles.
  // Each color occupies one tile (a row containing variants).
  private static readonly ATLAS_PAGE_SIZE = 1024; // logical pixels
  private atlasAllocator: AtlasAllocator = new AtlasAllocator(
    BlossomSpriteCollection.ATLAS_PAGE_SIZE,
    TEXTURE_SIZE * DPR,
    TEXTURE_SIZE * DPR,
  );

  private tempCanvas: HTMLCanvasElement = document.createElement("canvas");
  private textureLoaded: boolean = false;

  constructor() {
    const svg = blossomSvg.replace(`fill="#DE0010"`, `fill="#ccc"`); // Make base white
    loadSprite(svg, (img) => {
      const size = Math.round(TEXTURE_SIZE * DPR);
      // Create sprite variants with slight rotation differences
      for (let i = 0; i < SPRITE_VARIANTS; i++) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        ctx.translate(size / 2, size / 2);
        ctx.rotate((i * Math.PI) / (SPRITE_VARIANTS * 2));
        ctx.scale(1.0 - i * 0.05, 1.0 - i * 0.05);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);

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
   * Get tinted sprites for a given color (cached, using atlas)
   */
  public getTintedSprites(color: string): Sprite[] | null {
    if (!this.textureLoaded || this.baseSprites.length === 0) return null;

    const cached = this.tintedSpriteCache.get(color);
    if (cached) return cached;

    const tintedSprites: Sprite[] = [];
    for (const baseSprite of this.baseSprites) {
      const { canvas, ctx, x: dX, y: dY } = this.atlasAllocator.allocate();

      const tinted = this.createTintedImage(baseSprite, color);
      // Draw the tint into the allocated tile area
      ctx.drawImage(tinted, dX, dY, tinted.width, tinted.height);

      tintedSprites.push(new Sprite(canvas, dX, dY, tinted.width, tinted.height));
    }
    this.tintedSpriteCache.set(color, tintedSprites);

    return tintedSprites;
  }

  private createTintedImage(baseSprite: HTMLCanvasElement, color: string): HTMLCanvasElement {
    const size = Math.round(TEXTURE_SIZE * DPR);

    const canvas = this.tempCanvas;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create tinted sprite canvas context");

    ctx.clearRect(0, 0, size, size);

    // Draw base sprite at logical size
    ctx.drawImage(baseSprite, 0, 0, size, size);

    // Apply color tint using multiply blend
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);

    // Restore alpha from original
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(baseSprite, 0, 0, size, size);

    return canvas;
  }
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

/**
 * Simple atlas page allocator.
 * - Pages are fixed-size logical pixels (pageSize x pageSize)
 * - Each page is subdivided into a uniform grid of tiles sized tileWidth x tileHeight
 * - allocate() returns a free cell and the page's canvas/context
 */
class AtlasAllocator {
  private cols: number;
  private rows: number;
  private pages: Array<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> = [];
  // single global nextIndex used for all allocations
  private nextIndex = 0;

  constructor(
    private pageSize: number,
    private tileWidth: number,
    private tileHeight: number,
  ) {
    this.cols = Math.floor(this.pageSize / this.tileWidth) || 1;
    this.rows = Math.floor(this.pageSize / this.tileHeight) || 1;
  }

  public allocate() {
    const cellsPerPage = this.cols * this.rows;

    // Determine allocation slot using global nextIndex
    const index = this.nextIndex++;
    const pageIndex = Math.floor(index / cellsPerPage);
    const cellIndex = index % cellsPerPage;
    const col = cellIndex % this.cols;
    const row = Math.floor(cellIndex / this.cols);

    // Ensure the target page exists (create pages up to pageIndex)
    if (this.pages.length <= pageIndex) {
      this.createPage();
    }

    const p = this.pages[pageIndex];
    if (!p) throw new Error("Allocated page missing");

    return {
      canvas: p.canvas,
      ctx: p.ctx,
      x: col * this.tileWidth,
      y: row * this.tileHeight,
    };
  }

  private createPage() {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(this.pageSize);
    canvas.height = Math.round(this.pageSize);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create atlas page context");

    this.pages.push({ canvas, ctx });
  }
}
