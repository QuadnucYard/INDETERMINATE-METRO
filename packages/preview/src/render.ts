import type { State } from "vanjs-core";
import van from "vanjs-core";
import { BlossomSchedule } from "./blossom/schedule";
import { BlossomSystem } from "./blossom/system";
import type { ControlsState } from "./controls";
import { getTotalRidershipAtDay } from "./keyframe";
import { MetroRenderer } from "./metro-renderer";
import { ModelRenderer } from "./model-renderer";
import { PositionAnimator } from "./position-animator";
import type { PositionRefMap, PreviewData, Rect, RenderStyle } from "./types";

function useMetroRenderer(
  data: State<PreviewData | null>,
  controlsState: ControlsState,
  styles: State<RenderStyle>,
  positionMap: PositionRefMap,
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
    positionAnimator.update(positionMap, data, controlsState.currentDay.val, performance.now());
    // Render frame with animated positions
    renderer.render(data, controlsState.currentDay.val, styles.val, positionMap);
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

function useBlossomRenderer(
  data: State<PreviewData | null>,
  controlsState: ControlsState,
  positionMap: PositionRefMap,
) {
  const blossomSystem = new BlossomSystem();
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

  const schedule = new BlossomSchedule(blossomSystem, positionMap);

  // Sync schedule to current day
  van.derive(() => {
    if (!data.val) return;

    const day = Math.floor(controlsState.currentDay.val);
    schedule.update(data.val, day);
  });

  return { resize, canvas: blossomSystem.getCanvas() };
}

function useModelRenderer(data: State<PreviewData | null>, controlsState: ControlsState) {
  const renderer = new ModelRenderer();

  let lastTime = performance.now();

  function animate() {
    const now = performance.now();
    const dt = (now - lastTime) / 1000; // seconds
    lastTime = now;

    if (data.val) {
      const day = Math.floor(controlsState.currentDay.val);
      const totalRidership = getTotalRidershipAtDay(data.val, day);
      const value = totalRidership / 100.0;
      renderer.update(dt, value, controlsState.rotationSpeedMultiplier.val);
    }

    requestAnimationFrame(animate);
  }
  animate();

  const resize = (_data: PreviewData, rect: Rect) => {
    renderer.resize(rect);
  };

  return { resize, canvas: renderer.getCanvas() };
}

export function useRenderer(
  data: State<PreviewData | null>,
  controlsState: ControlsState,
  styles: State<RenderStyle>,
) {
  const { div } = van.tags;

  const positionMap: PositionRefMap = new Map();

  const metroRenderer = useMetroRenderer(data, controlsState, styles, positionMap);
  const blossomRenderer = useBlossomRenderer(data, controlsState, positionMap);
  const modelRenderer = useModelRenderer(data, controlsState);

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
