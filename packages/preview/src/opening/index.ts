import van from "vanjs-core";
import { BlossomSystem } from "@/blossom/system";
import type { Clock, ClockSubscriber } from "../clock";
import { SceneManager } from "./scene";
import { SCENES, type SceneCtx } from "./scenes";

const { div } = van.tags;

interface OpeningAnimationOptions {
  onComplete?: () => void;
  width: number;
  height: number;
}

export class OpeningAnimation implements ClockSubscriber {
  private sceneManager: SceneManager<SceneCtx>;

  private width: number;
  private height: number;
  private container: HTMLElement;
  private linesCanvas: HTMLCanvasElement;
  private blossomSystem: BlossomSystem;
  private onComplete?: () => void;
  private skipHandler?: (event: KeyboardEvent) => void;
  private unsubscribeClock?: () => void;

  constructor(
    private clock: Clock,
    options: OpeningAnimationOptions,
  ) {
    this.onComplete = options.onComplete;
    this.width = options.width;
    this.height = options.height;

    this.sceneManager = new SceneManager(SCENES);

    this.blossomSystem = new BlossomSystem();
    this.blossomSystem.resize(
      { width: this.width, height: this.height },
      { width: this.width, height: this.height },
    );

    // Create canvas for vertical lines
    this.linesCanvas = document.createElement("canvas");
    this.linesCanvas.className = "opening-lines";
    this.linesCanvas.width = this.width;
    this.linesCanvas.height = this.height;

    // Create container with proper styling for screen fit
    this.container = div(
      {
        className: "main",
        style:
          "position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden;",
      },
      div(
        {
          className: "canvas-container",
          style:
            "position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;",
        },
        this.linesCanvas,
        this.blossomSystem.getCanvas(),
      ),
    );
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public update(dt: number, _time: number): void {
    this.sceneManager.update(dt, {
      width: this.width,
      height: this.height,
      mainCanvas: this.linesCanvas,
      blossomSystem: this.blossomSystem,
    });
    if (this.sceneManager.isFinished()) {
      this.onComplete?.();
      this.cleanup();
    }
  }

  public start(): void {
    this.skipHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        this.onComplete?.();
        this.cleanup();
      }
    };
    document.addEventListener("keydown", this.skipHandler);

    // Subscribe to master clock
    this.unsubscribeClock = this.clock.subscribe(this);
  }

  private cleanup(): void {
    if (this.skipHandler) {
      document.removeEventListener("keydown", this.skipHandler);
      this.skipHandler = undefined;
    }
    if (this.unsubscribeClock) {
      this.unsubscribeClock();
      this.unsubscribeClock = undefined;
    }
    this.blossomSystem.clear();
    this.container.remove();
  }

  public destroy(): void {
    this.cleanup();
  }
}
