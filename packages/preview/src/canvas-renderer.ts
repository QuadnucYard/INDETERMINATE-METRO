import type { Rect } from "./types";

export abstract class CanvasRenderer {
  protected canvas: HTMLCanvasElement;
  protected scale: number = 1;
  protected pixelRatio: number = 1;
  protected ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.pixelRatio = window.devicePixelRatio || 1;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not supported");
    this.ctx = ctx;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Resize canvas to given dimensions while maintaining aspect ratio
   */
  public resize(rect: Rect, refRect: Rect) {
    const aspectRatio = refRect.width / refRect.height;
    const containerRatio = rect.width / rect.height;

    if (containerRatio > aspectRatio) {
      // Container is wider - fit to height
      const targetW = rect.height * aspectRatio;
      const targetH = rect.height;
      this.pixelRatio = setCanvasSizeForDisplay(this.canvas, targetW, targetH);
      this.scale = rect.height / refRect.height;
    } else {
      // Container is taller - fit to width
      const targetW = rect.width;
      const targetH = rect.width / aspectRatio;
      this.pixelRatio = setCanvasSizeForDisplay(this.canvas, targetW, targetH);
      this.scale = rect.width / refRect.width;
    }
  }
}

/**
 * Set canvas CSS size and backing store size for device pixel ratio
 * Returns active device pixel ratio applied.
 */
export function setCanvasSizeForDisplay(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  devicePixelRatio: number = window.devicePixelRatio || 1,
) {
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  return dpr;
}
