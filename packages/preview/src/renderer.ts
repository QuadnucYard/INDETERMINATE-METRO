import type { State } from "vanjs-core";
import van from "vanjs-core";
import type { ControlsState } from "./controls";
import { ParticleAnimator } from "./particle/animator";
import { ParticleSystem } from "./particle/system";
import { PositionAnimator } from "./position-animator";
import {
  type LineData,
  type PreviewData,
  type Rect,
  type RenderStyle,
  ServiceState,
} from "./types";
import { getActiveStations, getStateAtDay, hexToRgb } from "./utils";

const LINE_MARGIN = 5;
const STATION_RADIUS = 6;
const STATION_STROKE_WIDTH = 2.5;

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
  public resize(rect: Rect, refRect: Rect) {
    const aspectRatio = refRect.width / refRect.height;
    const containerRatio = rect.width / rect.height;

    if (containerRatio > aspectRatio) {
      // Container is wider - fit to height
      this.canvas.width = rect.height * aspectRatio;
      this.canvas.height = rect.height;
      this.scale = rect.height / refRect.height;
    } else {
      // Container is taller - fit to width
      this.canvas.width = rect.width;
      this.canvas.height = rect.width / aspectRatio;
      this.scale = rect.width / refRect.width;
    }
  }

  /**
   * Render the metro visualization
   */
  public render(
    data: PreviewData,
    day: number,
    styles: RenderStyle,
    stationPositions?: Map<string, Map<string, number>>,
  ) {
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
        const linePositions = stationPositions?.get(lineId);
        this.renderLine(line, dayIndex, styles, linePositions);
      }
    }

    ctx.restore();
  }

  private renderLine(
    line: LineData,
    day: number,
    styles: RenderStyle,
    stationPositions?: Map<string, number>,
  ) {
    const lineState = getStateAtDay(line.statePoints, day);
    if (lineState === ServiceState.Never || lineState === ServiceState.Closed) return;

    const [r, g, b] = hexToRgb(line.colorHex);
    const opacity = lineState === ServiceState.Suspended ? 0.4 : 1;

    // Calculate width from raw ridership
    const ridership = line.ridership[day] ?? line.ridership[line.ridership.length - 1] ?? 0;
    const widthPx = calculateWidth(ridership / 100) * styles.widthScale;

    const { activeStations, minY, maxY } = getActiveStations(line, day, stationPositions);
    if (activeStations.length === 0) return;

    const ctx = this.ctx;

    // Draw the line stem
    ctx.beginPath();
    ctx.moveTo(line.x, minY - LINE_MARGIN);
    ctx.lineTo(line.x, maxY + LINE_MARGIN);
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
  const positionAnimator = new PositionAnimator();
  let animatedPositions: Map<string, Map<string, number>> | undefined;

  const render = (data: PreviewData) => {
    // Update animated positions
    animatedPositions = positionAnimator.update(
      data,
      controlsState.currentDay.val,
      performance.now(),
    );
    // Render frame with animated positions
    renderer.render(data, controlsState.currentDay.val, styles.val, animatedPositions);
  };

  const resize = (data: PreviewData, rect: Rect) => {
    renderer.resize(rect, data.meta);
    render(data);
  };

  // Independent animation loop for position transitions
  function animate() {
    if (data.val && positionAnimator.isAnimating(performance.now())) {
      render(data.val);
    }
    requestAnimationFrame(animate);
  }
  animate();

  van.derive(() => {
    if (data.val) {
      render(data.val);
    }
  });

  return { resize, canvas: renderer.getCanvas() };
}

function useParticleRenderer(data: State<PreviewData | null>, controlsState: ControlsState) {
  const particleSystem = new ParticleSystem(960, 540);
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

  const resize = (data: PreviewData, rect: Rect) => {
    particleSystem.resize(rect, data.meta);
    render();
  };

  van.derive(() => {
    render();
  });

  return { resize, canvas: particleSystem.getCanvas() };
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

  const canvasSize = van.state<Rect | null>(null);

  van.derive(() => {
    if (data.val && canvasSize.val) {
      metroRenderer.resize(data.val, canvasSize.val);
      particleRenderer.resize(data.val, canvasSize.val);
    }
  });

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry) {
      canvasSize.val = entry.contentRect;
    }
  });
  resizeObserver.observe(canvasContainer);

  return { canvasContainer };
}
