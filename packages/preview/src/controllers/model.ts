import type { State } from "vanjs-core";
import type { Clock } from "@/clock";
import type { ControlsState } from "@/controls";
import { getTotalRidershipAtDay } from "@/keyframe";
import { ModelRenderer } from "@/model-renderer";
import type { PreviewData, Rect } from "@/types";

interface ModelControllerOptions {
  currentDay: State<number>;
  timeScale: State<number>;
  rotationSpeedMultiplier: State<number>;
}

class ModelController {
  constructor(
    private renderer: ModelRenderer,
    private data: State<PreviewData | null>,
    private opts: ModelControllerOptions,
  ) {}

  update(dt: number, _time: number): void {
    if (!this.data.val) return;

    const dtScaled = dt * this.opts.timeScale.val;

    const day = Math.floor(this.opts.currentDay.val);
    const totalRidership = getTotalRidershipAtDay(this.data.val, day);
    const value = totalRidership / 100.0;
    this.renderer.update(dtScaled, value, this.opts.rotationSpeedMultiplier.val);
  }
}

export function useModelRenderer(
  data: State<PreviewData | null>,
  controlsState: ControlsState,
  clock: Clock,
) {
  const renderer = new ModelRenderer();

  const controller = new ModelController(renderer, data, {
    currentDay: controlsState.currentDay,
    timeScale: controlsState.speed,
    rotationSpeedMultiplier: controlsState.rotationSpeedMultiplier,
  });
  clock.subscribe(controller);

  const resize = (_data: PreviewData, rect: Rect) => {
    renderer.resize(rect);
  };

  return { resize, canvas: renderer.getCanvas() };
}
