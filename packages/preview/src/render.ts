import type { State } from "vanjs-core";
import van from "vanjs-core";
import type { Clock } from "./clock";
import { useBlossomRenderer, useMetroRenderer, useModelRenderer } from "./controllers";
import type { ControlsState } from "./controls";
import type { PositionRefMap, PreviewData, Rect, RenderStyle } from "./types";

export function useRenderer(
  data: State<PreviewData | null>,
  controlsState: ControlsState,
  styles: State<RenderStyle>,
  clock: Clock,
) {
  const { div } = van.tags;

  const positionMap: PositionRefMap = new Map();

  const metroRenderer = useMetroRenderer(data, controlsState, styles, positionMap, clock);
  const blossomRenderer = useBlossomRenderer(data, controlsState, positionMap, clock);
  const modelRenderer = useModelRenderer(data, controlsState, clock);

  const canvasContainer = div(
    { class: "canvas-container" },
    modelRenderer.canvas,
    metroRenderer.canvas,
    blossomRenderer.canvas,
  );

  const canvasSize = van.state<Rect | null>(null);

  van.derive(() => {
    if (data.val && canvasSize.val) {
      metroRenderer.resize(data.val, canvasSize.val);
      blossomRenderer.resize(data.val, canvasSize.val);
      modelRenderer.resize(data.val, canvasSize.val);
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
