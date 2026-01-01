/**
 * Centralized clock system for managing all animations
 */

export interface ClockSubscriber {
  /**
   * Called each frame with time delta and current time
   * @param dt Time delta since last update in seconds
   * @param time Current animation time in seconds (elapsed since clock start/reset)
   */
  update(dt: number, time: number): void;
}

export class Clock {
  private subscribers: Set<ClockSubscriber> = new Set();
  private currentTime: number = 0; // Current animation time in seconds (elapsed since start/reset)
  private animationId?: number;
  private _isRunning: boolean = false;
  private lastRealTime: number = 0; // Real wall time from performance.now() in milliseconds

  public subscribe(subscriber: ClockSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  public start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this.lastRealTime = performance.now();
    this.tick();
  }

  public stop(): void {
    if (!this._isRunning) return;
    this._isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }
  }

  /**
   * Manually advance animation time
   * @param dtSeconds Time delta to advance in seconds
   */
  public tickManual(dtSeconds: number): void {
    this.currentTime += dtSeconds; // seconds
    this.updateSubscribers(dtSeconds, this.currentTime);
  }

  private tick = (): void => {
    if (!this._isRunning) return;

    const now = performance.now(); // milliseconds
    const realDt = (now - this.lastRealTime) / 1000; // convert to seconds
    this.lastRealTime = now;

    this.currentTime += realDt; // seconds
    this.updateSubscribers(realDt, this.currentTime);

    this.animationId = requestAnimationFrame(this.tick);
  };

  private updateSubscribers(dt: number, time: number): void {
    for (const subscriber of this.subscribers) {
      subscriber.update(dt, time);
    }
  }

  /**
   * Get current animation time
   * @returns Current time in seconds
   */
  public getTime(): number {
    return this.currentTime;
  }

  /**
   * Set current animation time
   * @param timeSeconds New time in seconds
   */
  public setTime(timeSeconds: number): void {
    this.currentTime = timeSeconds;
  }

  /**
   * Check if the clock is currently running
   * @returns true if the clock is running, false otherwise
   */
  public get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Reset animation time to 0
   */
  public reset(): void {
    this.currentTime = 0;
    this.lastRealTime = performance.now();
  }
}
