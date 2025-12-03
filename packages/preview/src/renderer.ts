import type { State } from "vanjs-core";
import van from "vanjs-core";
import type { ControlsState } from "./controls";
import type { LineIR, PreviewIR, RenderStyle } from "./types";
import { getActiveStations, getStateAtDay, hexToRgb } from "./utils";

const STATION_RADIUS = 6;
const STATION_STROKE_WIDTH = 2.5;

export class MetroRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    this.ctx = ctx;
  }

  /**
   * Resize canvas to given dimensions
   */
  resize(rect: { width: number; height: number }): boolean {
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    return true;
  }

  /**
   * Render the metro visualization
   */
  render(ir: PreviewIR, day: number, styles: RenderStyle) {
    const { meta, lines } = ir;
    const dayIndex = Math.floor(day);

    // Get canvas physical dimensions
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    const ctx = this.ctx;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Calculate scale to fit reference size (meta.compW x meta.compH) into canvas
    // while maintaining aspect ratio
    const scale = Math.min(canvasWidth / meta.width, canvasHeight / meta.height);

    // Center the composition
    const offsetX = (canvasWidth - meta.width * scale) / 2;
    const offsetY = (canvasHeight - meta.height * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Render each line in reference coordinate space
    for (const lineId in lines) {
      const line = lines[lineId];
      if (line) {
        this.renderLine(line, dayIndex, styles);
      }
    }

    ctx.restore();
  }

  private renderLine(line: LineIR, day: number, styles: RenderStyle) {
    const lineState = getStateAtDay(line.statePoints, day);
    if (lineState === 0 || lineState === 3) return; // Never or Closed

    const [r, g, b] = hexToRgb(line.colorHex);
    const opacity = lineState === 2 ? 0.4 : 1; // Suspended : Open

    // Calculate width from raw ridership
    const ridership = line.ridership[day] ?? line.ridership[line.ridership.length - 1] ?? 0;
    const widthPx = calculateWidth(ridership / 100) * styles.widthScale;

    const { activeStations, minY, maxY } = getActiveStations(line, day);
    if (activeStations.length === 0) return;

    const ctx = this.ctx;

    // Draw the line stem
    ctx.beginPath();
    ctx.moveTo(line.x, minY);
    ctx.lineTo(line.x, maxY);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    ctx.lineWidth = widthPx;
    ctx.lineCap = "round";
    ctx.stroke();

    // Draw station circles
    for (const { station, y, state } of activeStations) {
      const stOpacity = state === 2 ? 0.4 : 1; // Suspended : Open

      // Fill circle (white/light)
      ctx.beginPath();
      ctx.arc(line.x, y, STATION_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${stOpacity * 0.9})`;
      ctx.fill();

      // Stroke with line color
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${stOpacity})`;
      ctx.lineWidth = STATION_STROKE_WIDTH;
      ctx.stroke();

      // Draw station label
      if (styles.showLabels) {
        ctx.save();
        ctx.font = "12px system-ui";
        ctx.fillStyle = `rgba(255, 255, 255, ${stOpacity * 0.8})`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const label = station.name;
        ctx.fillText(label, line.x + STATION_RADIUS + 8, y);
        ctx.restore();
      }
    }

    // Draw line name
    if (styles.showLabels && activeStations.length > 0) {
      ctx.save();
      ctx.font = "bold 20px system-ui";
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const lineName = line.name || line.id;
      ctx.fillText(lineName, line.x, minY - 10);
      ctx.restore();
    }
  }
}

/**
 * Calculate line width from raw value
 */
function calculateWidth(baseValue: number, basePx = 2, scalePx = 20, gamma = 0.6): number {
  return basePx + baseValue ** gamma * scalePx;
}

export function useRenderer(
  data: State<PreviewIR | null>,
  controlsState: ControlsState,
  styles: State<RenderStyle>,
) {
  const { div, canvas } = van.tags;

  const canvasElem = canvas();
  const renderer = new MetroRenderer(canvasElem);

  const render = () => {
    if (data.val && renderer) {
      renderer.render(data.val, controlsState.currentDay.val, styles.val);
    }
  };

  van.derive(() => {
    render();
  });

  const canvasContainer = div({ class: "canvas-container" }, canvasElem);

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    renderer?.resize(entry.contentRect);
    render();
  });
  resizeObserver.observe(canvasContainer);

  return { renderer, canvasContainer };
}
