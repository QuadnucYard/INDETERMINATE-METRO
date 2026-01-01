import type { State } from "vanjs-core";
import type { Clock } from "./clock";
import type { ControlsState } from "./controls";
import type { PreviewData } from "./types";

class AnimationController {
  private data: State<PreviewData | null>;
  private controlsState: ControlsState;

  constructor(data: State<PreviewData | null>, controlsState: ControlsState) {
    this.data = data;
    this.controlsState = controlsState;
  }

  update(dt: number, _time: number): void {
    const { currentDay, speed, isPlaying } = this.controlsState;

    // Update currentDay if playing
    if (isPlaying.val && this.data.val) {
      const newDay = currentDay.val + speed.val * dt;
      const maxDay = this.data.val.days.length - 1;

      if (newDay >= maxDay) {
        currentDay.val = maxDay;
        isPlaying.val = false;
      } else {
        currentDay.val = newDay;
      }
    }
  }
}

export function useAnimation(
  data: State<PreviewData | null>,
  controlsState: ControlsState,
  clock: Clock,
) {
  const controller = new AnimationController(data, controlsState);
  const unsubscribe = clock.subscribe(controller);

  // Return cleanup function
  return unsubscribe;
}
