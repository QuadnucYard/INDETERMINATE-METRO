import type { State } from "vanjs-core";
import van from "vanjs-core";
import type { Clock } from "@/clock";
import type { ControlsState } from "@/controls";
import { MetroRenderer } from "@/metro-renderer";
import { PositionAnimator } from "@/position-animator";
import type { PositionRefMap, PreviewData, Rect, RenderStyle } from "@/types";

interface PositionAnimationControllerOpts {
  currentDay: State<number>;
  styles: State<RenderStyle>;
}

class PositionAnimationController {
  constructor(
    private positionAnimator: PositionAnimator,
    private positionMap: PositionRefMap,
    private data: State<PreviewData | null>,
    private renderer: MetroRenderer,
    private opts: PositionAnimationControllerOpts,
  ) {}

  update(_dt: number, time: number): void {
    if (!this.data.val) return;
    if (!this.positionAnimator.isAnimating(time)) return;

    // Update animated positions
    this.positionAnimator.update(this.positionMap, this.data.val, this.opts.currentDay.val, time);
    // Render frame with animated positions
    this.renderer.render(
      this.data.val,
      this.opts.currentDay.val,
      this.opts.styles.val,
      this.positionMap,
    );
  }
}

export function useMetroRenderer(
  data: State<PreviewData | null>,
  controlsState: ControlsState,
  styles: State<RenderStyle>,
  positionMap: PositionRefMap,
  clock: Clock,
) {
  const renderer = new MetroRenderer();
  const positionAnimator = new PositionAnimator();

  // Preload train head images when data is available
  van.derive(() => {
    if (data.val) {
      renderer.preloadTrainHeads(data.val.lines);
    }
  });

  const render = (data: PreviewData) => {
    // Update animated positions
    positionAnimator.update(positionMap, data, controlsState.currentDay.val, clock.getTime());
    // Render frame with animated positions
    renderer.render(data, controlsState.currentDay.val, styles.val, positionMap);
  };

  const resize = (data: PreviewData, rect: Rect) => {
    renderer.resize(rect, data.meta);
    render(data);
  };

  // Create controller for master clock
  const controller = new PositionAnimationController(
    positionAnimator,
    positionMap,
    data,
    renderer,
    {
      currentDay: controlsState.currentDay,
      styles,
    },
  );
  clock.subscribe(controller);

  van.derive(() => {
    if (data.val) {
      render(data.val);
    }
  });

  return { resize, canvas: renderer.getCanvas() };
}
