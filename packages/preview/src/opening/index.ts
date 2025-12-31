import van from "vanjs-core";
import { BlossomSystem } from "@/blossom/system";
import { SceneManager } from "./scene";
import { SCENES, type SceneCtx } from "./scenes";

const { div } = van.tags;

interface OpeningAnimationOptions {
  onComplete?: () => void;
  width: number;
  height: number;
}

export class OpeningAnimation {
  private sceneManager: SceneManager<SceneCtx>;

  private width: number;
  private height: number;
  private container: HTMLElement;
  private linesCanvas: HTMLCanvasElement;
  private blossomSystem: BlossomSystem;
  private animationId?: number;
  private onComplete?: () => void;

  constructor(options: OpeningAnimationOptions) {
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

  public start(): void {
    let lastUpdateTime = 0;

    const animate = () => {
      const now = performance.now();
      this.sceneManager.update((now - lastUpdateTime) / 1000, {
        width: this.width,
        height: this.height,
        mainCanvas: this.linesCanvas,
        blossomSystem: this.blossomSystem,
      });
      if (this.sceneManager.isFinished()) {
        this.onComplete?.();
        this.cleanup();
        return;
      }
      lastUpdateTime = now;

      this.animationId = requestAnimationFrame(animate);
    };

    animate();
  }

  private cleanup(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }
    this.blossomSystem.clear();
    this.container.remove();
  }

  public destroy(): void {
    this.cleanup();
  }
}
