export interface Scene<C> {
  name: string;
  duration: number;

  enter?(sctx: C): void;
  leave?(sctx: C): void;
  update?(dt: number, t: number, sctx: C): void;
  render?(sctx: C): void;
}

export class SceneManager<C> {
  private time: number = 0;
  private pendingScenes: Scene<C>[];
  private currentScene?: Scene<C>;

  constructor(scenes: Scene<C>[]) {
    this.pendingScenes = scenes;
  }

  public update(dt: number, sctx: C): void {
    this.time += dt;

    if (!this.currentScene) {
      const nextScene = this.pendingScenes.shift();
      if (nextScene) {
        nextScene.enter?.(sctx);
        this.currentScene = nextScene;
        this.time = 0;
      }
    }

    if (this.currentScene) {
      const relTime = this.time / this.currentScene.duration;
      this.currentScene.update?.(dt, relTime, sctx);
      this.currentScene.render?.(sctx);

      if (relTime >= 1.0) {
        this.currentScene.leave?.(sctx);
        this.currentScene = undefined;
      }
    }
  }

  public isFinished(): boolean {
    return !this.currentScene && this.pendingScenes.length === 0;
  }
}
