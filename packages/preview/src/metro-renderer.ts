import { CanvasRenderer } from "./canvas-renderer";
import { Rgb, Rgba } from "./color";
import {
  getActiveStations,
  getRidershipAtDay,
  getRouteSegmentsAtDay,
  getStateAtDay,
} from "./keyframe";
import {
  type ActiveLineStations,
  type LineData,
  type PositionRefMap,
  type PreviewData,
  type RenderStyle,
  ServiceState,
  type TrainHeadAtlas,
  type Vec2,
} from "./types";
import { headKey } from "./utils";

// const LINE_MARGIN = 5;
const STATION_RADIUS = 6;
const STATION_STROKE_WIDTH = 2.5;
const TRAIN_HEAD_SIZE = 96;
// Placeholder triangle pointing down
const TRAIN_HEAD_SRC =
  "data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32"><path d="M4 4 L28 4 L16 28 Z" fill="white" stroke="black" stroke-width="2"/></svg>',
  );

type RouteSegmentInfo = { positions: Vec2[]; state: ServiceState };

/**
 * Render the metro visualization
 */
export class MetroRenderer extends CanvasRenderer {
  private atlasImages: Map<string, HTMLImageElement> = new Map();
  private placeholderImg: HTMLImageElement;

  constructor() {
    super();
    this.placeholderImg = new Image();
    this.placeholderImg.src = TRAIN_HEAD_SRC;
  }

  /**
   * Preload train head atlas images
   */
  public preloadTrainHeads(lines: Record<string, LineData>) {
    for (const line of Object.values(lines)) {
      if (line.head && !this.atlasImages.has(line.head.path)) {
        const img = new Image();
        img.src = `${import.meta.env.BASE_URL}${line.head.path}`;
        this.atlasImages.set(line.head.path, img);
      }
    }
  }

  public render(data: PreviewData, day: number, styles: RenderStyle, positionMap?: PositionRefMap) {
    type LineRenderData = {
      line: LineData;
      activeStations: ActiveLineStations;
      routeSegments: RouteSegmentInfo[];
      headPos?: Vec2;
      widthPx: number;
      opacity: number;
      color: Rgb;
    };

    const lineRenderData: LineRenderData[] = [];
    const { lines } = data;
    const dayIndex = Math.floor(day);

    // Prepare render data
    for (const line of Object.values(lines)) {
      const lineState = getStateAtDay(line.statePoints, dayIndex);
      if (lineState === ServiceState.Never || lineState === ServiceState.Closed) continue;

      const activeStations = getActiveStations(line, dayIndex, positionMap);
      if (activeStations.activeStations.length === 0) continue;

      // Get route segments for this line
      const rawRouteSegments = getRouteSegmentsAtDay(line.routePoints, dayIndex);
      const routeSegments = rawRouteSegments.map((segment) => {
        const pts = segment.stations
          .map((sid) => positionMap?.get(sid)?.val)
          .filter((p) => p !== undefined) as Vec2[];
        return { positions: pts, state: segment.state } as RouteSegmentInfo;
      });

      const headPos = positionMap?.get(headKey(line.id))?.val;

      const ridership = getRidershipAtDay(line, dayIndex);
      const widthPx = calculateWidth(ridership / 100) * styles.widthScale;
      const opacity = lineState === ServiceState.Suspended ? 0.4 : 1;

      lineRenderData.push({
        line,
        activeStations,
        routeSegments,
        headPos,
        widthPx,
        opacity,
        color: Rgb.fromHex(line.colorHex),
      });
    }

    const ctx = this.ctx;

    // Clear canvas
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    // Apply device pixel ratio in the transform so drawing is rendered crisply
    // Transform maps logical reference space -> device pixels
    ctx.setTransform(this.pixelRatio * this.scale, 0, 0, this.pixelRatio * this.scale, 0, 0);

    // Pass 1: Draw all line stems
    for (const rd of lineRenderData) {
      this.renderLineStem(rd.activeStations, rd.routeSegments, rd.widthPx, rd.color);
    }

    // Pass 2: Draw all stations
    for (const rd of lineRenderData) {
      this.renderLineStations(rd.activeStations, rd.color);
    }

    // Pass 3: Draw train heads
    for (const rd of lineRenderData) {
      if (rd.headPos && rd.line.head) {
        this.renderTrainHead(rd.line.head, rd.headPos, rd.opacity);
      }
    }

    // Pass 4: Draw all labels
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
    routeSegments: RouteSegmentInfo[],
    widthPx: number,
    color: Rgb,
  ) {
    const { activeStations } = stationData;
    if (activeStations.length === 0) return;

    const ctx = this.ctx;
    ctx.lineWidth = widthPx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = widthPx;
    ctx.shadowColor = color.toCss();

    for (const seg of routeSegments) {
      const pts = seg.positions;
      if (!pts || pts.length < 2) continue;

      const alpha = seg.state === ServiceState.Suspended ? 0.4 : 1.0;
      ctx.strokeStyle = color.withAlpha(alpha).toCss();
      ctx.beginPath();

      const first = pts[0] as Vec2;
      ctx.moveTo(first.x, first.y);

      for (const pt of pts.slice(1)) {
        ctx.lineTo(pt.x, pt.y);
      }

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

  private renderTrainHead(head: TrainHeadAtlas, pos: Vec2, opacity: number) {
    const atlas = this.atlasImages.get(head.path);
    const imgToUse = atlas?.complete && atlas.naturalWidth > 0 ? atlas : this.placeholderImg;

    if (!imgToUse.complete || imgToUse.naturalWidth === 0) return;

    const ctx = this.ctx;
    const size = TRAIN_HEAD_SIZE;

    ctx.save();
    ctx.globalAlpha = opacity;

    if (imgToUse === this.placeholderImg) {
      // Draw placeholder centered at pos
      ctx.drawImage(imgToUse, pos.x - size / 2, pos.y - size / 2, size, size);
    } else {
      // Draw sprite from atlas
      const { x: sx, y: sy, w: sw, h: sh } = head.region;
      ctx.drawImage(
        imgToUse,
        sx,
        sy,
        sw,
        sh, // source rectangle in atlas
        pos.x - size / 2,
        pos.y - size / 2,
        size,
        size, // destination rectangle
      );
    }

    ctx.restore();
  }
}

/**
 * Calculate line width from raw value
 */
function calculateWidth(baseValue: number, basePx = 2, scalePx = 20, gamma = 0.6): number {
  return basePx + baseValue ** gamma * scalePx;
}
