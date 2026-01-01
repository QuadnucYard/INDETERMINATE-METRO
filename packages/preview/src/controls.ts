import van, { type State } from "vanjs-core";
import type { RenderStyle } from "./types";

const { div, input, output, button, label, span } = van.tags;

export interface ControlsState {
  currentDay: State<number>;
  speed: State<number>;
  isPlaying: State<boolean>;
  particleTimeScale: State<number>;
  rotationSpeedMultiplier: State<number>;
}

export function createControls(
  controls: ControlsState,
  styles: State<RenderStyle>,
  maxDay: State<number>,
  getDayStr: (day: number) => string | undefined,
): HTMLElement {
  const { currentDay, speed, isPlaying } = controls;

  const visible = van.state(true);

  // Add key listener for toggling controls
  const toggleControls = (event: KeyboardEvent) => {
    if (event.key === "c" || event.key === "C") {
      visible.val = !visible.val;
    }
  };
  document.addEventListener("keydown", toggleControls);

  const when = (cond: boolean) => (cond ? "" : "display:none");

  const controlsElement = div(
    { class: "controls", style: () => when(visible.val) },
    // Progress section
    div(
      { class: "progress-section" },
      input({
        type: "range",
        class: "progress-bar",
        min: 0,
        max: maxDay,
        value: currentDay,
        oninput: (e: Event) => {
          currentDay.val = parseInt((e.target as HTMLInputElement).value, 10);
        },
      }),
    ),
    // Control bar
    div(
      { class: "control-bar" },
      // Current day display
      div(
        { class: "progress-info" },
        output(() => getDayStr(currentDay.val) ?? "-"),
      ),
      // Playback controls
      div(
        { class: "playback-controls" },
        button(
          {
            id: "play-btn",
            type: "button",
            onclick: () => {
              isPlaying.val = !isPlaying.val;
            },
          },
          () => (isPlaying.val ? "⏸" : "▶"),
        ),
        button(
          {
            type: "button",
            onclick: () => {
              currentDay.val = 0;
              isPlaying.val = false;
            },
          },
          "⏮",
        ),
        label(
          { class: "control-item" },
          span("Speed"),
          input({
            type: "range",
            min: 0,
            max: 60,
            value: speed,
            oninput: (e: Event) => {
              speed.val = parseFloat((e.target as HTMLInputElement).value);
            },
          }),
          output(() => `${speed.val}`),
        ),
        label(
          { class: "control-item" },
          span("Particle"),
          input({
            type: "range",
            min: 0.1,
            max: 2.0,
            step: 0.1,
            value: controls.particleTimeScale,
            oninput: (e: Event) => {
              controls.particleTimeScale.val = parseFloat((e.target as HTMLInputElement).value);
            },
          }),
          output(() => `${controls.particleTimeScale.val.toFixed(1)}x`),
        ),
        label(
          { class: "control-item" },
          span("3D Speed"),
          input({
            type: "range",
            min: 0,
            max: 5,
            step: 0.1,
            value: controls.rotationSpeedMultiplier,
            oninput: (e: Event) => {
              controls.rotationSpeedMultiplier.val = parseFloat(
                (e.target as HTMLInputElement).value,
              );
            },
          }),
          output(() => `${controls.rotationSpeedMultiplier.val.toFixed(1)}x`),
        ),
      ),
      // Settings controls
      div(
        { class: "settings-controls" },
        label(
          { class: "control-item" },
          span("Width"),
          input({
            type: "range",
            min: 0.2,
            max: 3,
            step: 0.1,
            value: styles.val.widthScale,
            oninput: (e: Event) => {
              styles.val = {
                ...styles.val,
                widthScale: parseFloat((e.target as HTMLInputElement).value),
              };
            },
          }),
          output(() => `${styles.val.widthScale.toFixed(1)}x`),
        ),
        label(
          { class: "control-item checkbox" },
          input({
            type: "checkbox",
            checked: styles.val.showLabels,
            onchange: (e: Event) => {
              styles.val = {
                ...styles.val,
                showLabels: (e.target as HTMLInputElement).checked,
              };
            },
          }),
          span("Labels"),
        ),
      ),
    ),
  );

  return controlsElement;
}
