import type { State } from "vanjs-core";
import van from "vanjs-core";
import type { ControlsState } from "./controls";
import { ParticleAnimator } from "./particle/animator";
import { ParticleSystem } from "./particle/system";
import { type LineData, type PreviewData, type RenderStyle, ServiceState } from "./types";
import { getActiveStations, getStateAtDay, hexToRgb } from "./utils";

const STATION_RADIUS = 6;
const STATION_STROKE_WIDTH = 2.5;

type Rect = {
  width: number;
  height: number;
};

export class MetroRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private scale: number = 1;

  constructor() {
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    this.ctx = ctx;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Resize canvas to given dimensions while maintaining aspect ratio
   */
  resize(rect: Rect, meta: Rect) {
    const aspectRatio = meta.width / meta.height;
    const containerRatio = rect.width / rect.height;

    if (containerRatio > aspectRatio) {
      // Container is wider - fit to height
      this.canvas.height = rect.height;
      this.canvas.width = rect.height * aspectRatio;
      this.scale = rect.height / meta.height;
    } else {
      // Container is taller - fit to width
      this.canvas.width = rect.width;
      this.canvas.height = rect.width / aspectRatio;
      this.scale = rect.width / meta.width;
    }
  }

  /**
   * Render the metro visualization
   */
  render(data: PreviewData, day: number, styles: RenderStyle) {
    const { lines } = data;
    const dayIndex = Math.floor(day);

    // Get canvas physical dimensions
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    const ctx = this.ctx;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    ctx.save();
    ctx.scale(this.scale, this.scale); // Fit reference size into canvas

    // Render each line in reference coordinate space
    for (const lineId in lines) {
      const line = lines[lineId];
      if (line) {
        this.renderLine(line, dayIndex, styles);
      }
    }

    this.ctx.restore();
  }

  private renderLine(line: LineData, day: number, styles: RenderStyle) {
    const lineState = getStateAtDay(line.statePoints, day);
    if (lineState === ServiceState.Never || lineState === ServiceState.Closed) return;

    const [r, g, b] = hexToRgb(line.colorHex);
    const opacity = lineState === ServiceState.Suspended ? 0.4 : 1;

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
    ctx.shadowBlur = widthPx;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.stroke();

    // Draw station circles
    for (const { station, y, state } of activeStations) {
      const stOpacity = state === ServiceState.Suspended ? 0.4 : 1;

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

function useMetroRenderer(
  data: State<PreviewData | null>,
  controlsState: ControlsState,
  styles: State<RenderStyle>,
) {
  const renderer = new MetroRenderer();

  const render = (data: PreviewData) => {
    // Render frame
    renderer.render(data, controlsState.currentDay.val, styles.val);
  };

  const resize = (data: PreviewData, rect: Rect) => {
    renderer.resize(rect, data.meta);
    render(data);
  };

  van.derive(() => {
    if (data.val) {
      render(data.val);
    }
  });

  return { resize, canvas: renderer.getCanvas() };
}

function useParticleRenderer(data: State<PreviewData | null>, controlsState: ControlsState) {
  const particleSystem = new ParticleSystem(1920, 1080);
  particleSystem.initPool(2000);

  const particleAnimator = new ParticleAnimator(particleSystem);

  let lastTime = performance.now();

  // Independent particle update loop
  function updateParticles() {
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (data.val) {
      particleSystem.update(dt * controlsState.speed.val * 0.1);
    }
    requestAnimationFrame(updateParticles);
  }
  updateParticles();

  const render = () => {
    if (data.val) {
      // Update particle animator
      particleAnimator.update(data.val, controlsState.currentDay.val);
    }
  };

  van.derive(() => {
    render();
  });

  return { canvas: particleSystem.getCanvas() };
}

export function useRenderer(
  data: State<PreviewData | null>,
  controlsState: ControlsState,
  styles: State<RenderStyle>,
) {
  const { div } = van.tags;

  const metroRenderer = useMetroRenderer(data, controlsState, styles);
  const particleRenderer = useParticleRenderer(data, controlsState);

  const canvasContainer = div(
    { class: "canvas-container" },
    metroRenderer.canvas,
    particleRenderer.canvas,
  );

  const pendingResize = van.state<Rect | null>(null);

  van.derive(() => {
    if (data.val && pendingResize.val) {
      metroRenderer.resize(data.val, pendingResize.val);
      pendingResize.val = null;
    }
  });

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry) {
      pendingResize.val = entry.contentRect;
    }
  });
  resizeObserver.observe(canvasContainer);

  return { canvasContainer };
}
