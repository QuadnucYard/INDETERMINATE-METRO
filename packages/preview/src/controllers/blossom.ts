import type { State } from "vanjs-core";
import van from "vanjs-core";
import { BlossomSchedule } from "@/blossom/schedule";
import { BlossomSystem } from "@/blossom/system";
import type { Clock } from "@/clock";
import type { ControlsState } from "@/controls";
import type { PositionRefMap, PreviewData, Rect } from "@/types";

interface BlossomControllerOptions {
  timeScale: State<number>;
}

class BlossomController {
  private totalTime: number = 0; // Accumulated animation time in seconds for particle physics

  constructor(
    private blossomSystem: BlossomSystem,
    private data: State<PreviewData | null>,
    private opts: BlossomControllerOptions,
  ) {}

  update(dt: number, _time: number): void {
    // Scale dt by particle time scale
    const scaledDt = dt * this.opts.timeScale.val;
    this.totalTime += scaledDt;

    if (!this.data.val) return;

    this.blossomSystem.update(scaledDt, this.totalTime);

    // Random gusts
    if (Math.random() * dt < 0.01) {
      this.blossomSystem.triggerGust(0.5 + Math.random());
    }
  }
}

export function useBlossomRenderer(
  data: State<PreviewData | null>,
  controlsState: ControlsState,
  positionMap: PositionRefMap,
  clock: Clock,
) {
  const blossomSystem = new BlossomSystem();
  blossomSystem.initPool(300);

  const controller = new BlossomController(blossomSystem, data, {
    timeScale: controlsState.particleTimeScale,
  });
  clock.subscribe(controller);

  const resize = (data: PreviewData, rect: Rect) => {
    blossomSystem.resize(rect, data.meta);
  };

  const schedule = new BlossomSchedule(blossomSystem, positionMap);

  // Sync schedule to current day
  van.derive(() => {
    if (!data.val) return;

    const day = Math.floor(controlsState.currentDay.val);
    schedule.update(data.val, day);
  });

  return { resize, canvas: blossomSystem.getCanvas() };
}
