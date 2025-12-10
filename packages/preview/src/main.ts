import van, { type State } from "vanjs-core";
import { useAnimation } from "./animation";
import { type ControlsState, createControls } from "./controls";
import { useData } from "./data-loader";
import { useRenderer } from "./render";
import type { RenderStyle } from "./types";
import "./styles.css";

const { div } = van.tags;

function ErrorDisplay() {
  return div(
    { style: "color: #ff4444; padding: 20px; font-family: system-ui;" },
    "Failed to load data. Please run the data generation first.",
  );
}

function App() {
  const { data } = useData();
  const controlsState: ControlsState = {
    currentDay: van.state(0),
    speed: van.state(10),
    isPlaying: van.state(false),
    particleTimeScale: van.state(1),
    rotationSpeedMultiplier: van.state(1),
  };
  const renderStyle: State<RenderStyle> = van.state({
    widthScale: 1,
    showLabels: true,
  });

  const controls = createControls(
    controlsState,
    renderStyle,
    van.derive(() => (data.val ? data.val.days.length - 1 : 0)),
    (day: number) => data.val?.days[Math.floor(day)],
  );

  useAnimation(data, controlsState);

  const { canvasContainer } = useRenderer(data, controlsState, renderStyle);

  const app = div({ id: "app" }, canvasContainer, controls);

  return app;
}

async function init() {
  try {
    van.add(document.body, App());
  } catch (err) {
    console.error("Failed to initialize:", err);
    van.add(document.body, ErrorDisplay());
  }
}

// Start the app
init();
