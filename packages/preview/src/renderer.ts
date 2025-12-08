import type { State } from "vanjs-core";
import van from "vanjs-core";
import { BlossomSchedule } from "./blossom/schedule";
import { BlossomSystem } from "./blossom/system";
import { Rgb, Rgba } from "./color";
import type { ControlsState } from "./controls";
import { PositionAnimator } from "./position-animator";
import {
  type ActiveLineStations,
  type LineData,
  type LineId,
  type PreviewData,
  type Rect,
  type RenderStyle,
  ServiceState,
  type StationId,
  type Vec2,
} from "./types";
import {
  getActiveStations,
  getRidershipAtDay,
  getRouteSegmentsAtDay,
  getStateAtDay,
} from "./utils";

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
   * Render order: all line stems first, then all stations, then all labels
   */
  public render(
    data: PreviewData,
    day: number,
    styles: RenderStyle,
    stationPositions?: Map<LineId, Map<StationId, Vec2>>,
  ) {
    // Collect render data for all lines
    type LineRenderData = {
      line: LineData;
      positions?: Map<StationId, Vec2>;
      activeStations: ActiveLineStations;
      routeSegments: Vec2[][];
      widthPx: number;
      opacity: number;
      color: Rgb;
    };

    const lineRenderData: LineRenderData[] = [];

    const { lines } = data;
    const dayIndex = Math.floor(day);

    // Prepare render data for main lines
    for (const [lineId, line] of Object.entries(lines)) {
      const lineState = getStateAtDay(line.statePoints, dayIndex);
      if (lineState === ServiceState.Never || lineState === ServiceState.Closed) continue;

      const positions = stationPositions?.get(lineId);
      const activeStations = getActiveStations(line, dayIndex, positions);
      if (activeStations.activeStations.length === 0) continue;

      // Get route segments for this line (or fallback to simple stem)
      const rawRouteSegments = getRouteSegmentsAtDay(line.routePoints, dayIndex);
      const routeSegments = rawRouteSegments.map((segment) =>
        segment
          .map((sid) => {
            const st = activeStations.activeStations.find((s) => s.station.id === sid);
            return st?.pos;
          })
          .filter((pos) => pos !== undefined),
      );

      const ridership = getRidershipAtDay(line, dayIndex);
      const widthPx = calculateWidth(ridership / 100) * styles.widthScale;
      const opacity = lineState === ServiceState.Suspended ? 0.4 : 1;

      lineRenderData.push({
        line,
        positions,
        activeStations,
        routeSegments,
        widthPx,
        opacity,
        color: Rgb.fromHex(line.colorHex),
      });
    }

    const ctx = this.ctx;

    // Clear canvas
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.scale(this.scale, this.scale); // Fit reference size into canvas

    // Pass 1: Draw all line stems
    for (const rd of lineRenderData) {
      this.renderLineStem(
        rd.activeStations,
        rd.routeSegments,
        rd.widthPx,
        rd.color.withAlpha(rd.opacity),
      );
    }

    // Pass 2: Draw all stations
    for (const rd of lineRenderData) {
      this.renderLineStations(rd.activeStations, rd.color);
    }

    // Pass 3: Draw all labels
    if (styles.showLabels) {
      for (const rd of lineRenderData) {
        this.renderLineLabels(rd.line, rd.activeStations, rd.color.withAlpha(rd.opacity));
      }
    }

    ctx.restore();
  }

  /**
   * Draw the line stem using route segments
   * Each segment is a polyline connecting station positions
   */
  private renderLineStem(
    stationData: ActiveLineStations,
    routeSegments: Vec2[][],
    widthPx: number,
    color: Rgba,
  ) {
    const { activeStations, firstPos, lastPos } = stationData;

    if (activeStations.length === 0) return;

    const ctx = this.ctx;

    ctx.strokeStyle = color.toCss();
    ctx.lineWidth = widthPx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = widthPx;
    ctx.shadowColor = ctx.strokeStyle;

    // If we have route segments, draw each as a polyline
    if (routeSegments.length > 0) {
      for (const segment of routeSegments) {
        if (segment.length < 2) continue;

        ctx.beginPath();
        const first = segment[0];
        if (first) {
          ctx.moveTo(first.x, first.y - LINE_MARGIN);

          for (let i = 1; i < segment.length; i++) {
            const pt = segment[i];
            if (pt) {
              ctx.lineTo(pt.x, pt.y);
            }
          }

          // Extend beyond last point
          const last = segment[segment.length - 1];
          if (last) {
            ctx.lineTo(last.x, last.y + LINE_MARGIN);
          }
        }
        ctx.stroke();
      }
    } else {
      // Fallback: simple vertical stem (for lines without routes defined)
      ctx.beginPath();
      ctx.moveTo(firstPos.x, firstPos.y - LINE_MARGIN);
      ctx.lineTo(lastPos.x, lastPos.y + LINE_MARGIN);
      ctx.stroke();
    }
  }

  /**
   * Draw station circles for a line
   */
  private renderLineStations(stationData: ActiveLineStations, color: Rgb) {
    const { activeStations } = stationData;
    if (activeStations.length === 0) return;

    const ctx = this.ctx;

    // Reset shadow for station circles
    ctx.shadowBlur = 0;

    for (const { pos, state } of activeStations) {
      const stOpacity = state === ServiceState.Suspended ? 0.4 : 1;

      // Fill circle (white/light)
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, STATION_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = new Rgba(255, 255, 255, stOpacity * 0.9).toCss();
      ctx.fill();

      // Stroke with line color
      ctx.strokeStyle = color.withAlpha(stOpacity).toCss();
      ctx.lineWidth = STATION_STROKE_WIDTH;
      ctx.stroke();
    }
  }

  /**
   * Draw labels for a line (station names and line name)
   */
  private renderLineLabels(line: LineData, stationData: ActiveLineStations, color: Rgba) {
    const { activeStations, firstPos } = stationData;
    if (activeStations.length === 0) return;

    const ctx = this.ctx;

    // Draw station labels
    for (const { station, pos, state } of activeStations) {
      const stOpacity = state === ServiceState.Suspended ? 0.4 : 1;
      ctx.save();
      ctx.font = "12px system-ui";
      ctx.fillStyle = new Rgba(255, 255, 255, stOpacity * 0.8).toCss();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(station.name, pos.x + STATION_RADIUS + 8, pos.y);
      ctx.restore();
    }

    // Draw line name
    ctx.save();
    ctx.font = "bold 20px system-ui";
    ctx.fillStyle = color.toCss();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const lineName = line.name || line.id;
    ctx.fillText(lineName, line.x, firstPos.y - 10);
    ctx.restore();
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
  let animatedPositions: Map<LineId, Map<StationId, Vec2>> | undefined;

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

function useBlossomRenderer(data: State<PreviewData | null>, controlsState: ControlsState) {
  const blossomSystem = new BlossomSystem(960, 540);
  blossomSystem.initPool(300);

  let lastTime = performance.now();
  let totalTime = 0;

  // Independent blossom update loop
  function updateBlossoms() {
    const now = performance.now();
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;

    // Scale dt by particle time scale
    const dt = rawDt * controlsState.particleTimeScale.val;
    totalTime += dt;

    if (data.val && controlsState.isPlaying.val) {
      blossomSystem.update(dt, totalTime);

      // Random gusts
      if (Math.random() * dt < 0.01) {
        blossomSystem.triggerGust(0.5 + Math.random());
      }
    } else if (data.val) {
      // Still update physics when paused but slower
      blossomSystem.update(dt, totalTime);
    }

    requestAnimationFrame(updateBlossoms);
  }
  updateBlossoms();

  const resize = (data: PreviewData, rect: Rect) => {
    blossomSystem.resize(rect, data.meta);
  };

  const schedule = new BlossomSchedule(blossomSystem);

  van.derive(() => {
    if (!data.val) return;

    const day = Math.floor(controlsState.currentDay.val);
    schedule.update(data.val, day);
  });

  return { resize, canvas: blossomSystem.getCanvas() };
}

export function useRenderer(
  data: State<PreviewData | null>,
  controlsState: ControlsState,
  styles: State<RenderStyle>,
) {
  const { div } = van.tags;

  const metroRenderer = useMetroRenderer(data, controlsState, styles);
  const blossomRenderer = useBlossomRenderer(data, controlsState);

  const canvasContainer = div(
    { class: "canvas-container" },
    metroRenderer.canvas,
    blossomRenderer.canvas,
  );

  const canvasSize = van.state<Rect | null>(null);

  van.derive(() => {
    if (data.val && canvasSize.val) {
      metroRenderer.resize(data.val, canvasSize.val);
      blossomRenderer.resize(data.val, canvasSize.val);
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
