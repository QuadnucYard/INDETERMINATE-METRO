import type { State } from "vanjs-core";
import type { ControlsState } from "./controls";
import type { PreviewData } from "./types";

export function useAnimation(data: State<PreviewData | null>, controlsState: ControlsState) {
  let lastFrameTime = 0;

  /**
   * Main animation loop
   */
  function animate(time: number, state: ControlsState) {
    const { currentDay, speed, isPlaying } = state;

    // Update currentDay if playing
    if (isPlaying.val && data.val) {
      const dt = (time - lastFrameTime) / 1000;
      const newDay = currentDay.val + speed.val * dt;
      const maxDay = data.val.meta.days.length - 1;

      if (newDay >= maxDay) {
        currentDay.val = maxDay;
        isPlaying.val = false;
      } else {
        currentDay.val = newDay;
      }
    }

    lastFrameTime = time;

    // Continue animation loop
    requestAnimationFrame((t) => animate(t, state));
  }

  // Start animation loop
  requestAnimationFrame((time) => {
    lastFrameTime = time;
    animate(time, controlsState);
  });
}
