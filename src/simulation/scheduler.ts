import type { PlaybackSpeed } from "../domain/types";
import { HISTORY_BOUNDARY_MS, MAX_STEPS_PER_TASK } from "./constants";

export interface ScheduledEngine {
  playing: boolean;
  playbackSpeed: PlaybackSpeed;
  stepAccumulator: number;
  step(activeWallSeconds: number): boolean;
}

export interface SchedulerCallbacks {
  historyBoundary?: () => void;
  yielded?: () => void;
  overload?: () => void;
  stepCommitted?: () => void;
}

export class SimulationScheduler {
  private lastTickMs: number | null = null;
  private historyBoundaryElapsedMs = 0;
  private visible = true;
  private mutationLocked = false;
  private overloadStartedMs: number | null = null;

  constructor(
    private readonly engine: ScheduledEngine,
    private readonly callbacks: SchedulerCallbacks = {},
  ) {}

  setVisibility(visible: boolean) {
    this.visible = visible;
    this.lastTickMs = null;
  }

  setMutationLocked(locked: boolean) {
    this.mutationLocked = locked;
    this.lastTickMs = null;
  }

  resetOrigin() {
    this.lastTickMs = null;
  }

  async tick(nowMs: number) {
    if (!Number.isFinite(nowMs) || nowMs < 0) throw new RangeError("INVALID_VALUE");
    if (!this.visible || !this.engine.playing || this.mutationLocked) {
      this.lastTickMs = nowMs;
      return 0;
    }
    if (this.lastTickMs === null) {
      this.lastTickMs = nowMs;
      return 0;
    }
    if (nowMs < this.lastTickMs) {
      this.lastTickMs = nowMs;
      return 0;
    }
    let cursor = this.lastTickMs;
    let completed = 0;
    while (cursor < nowMs) {
      const remainingBoundaryMs = HISTORY_BOUNDARY_MS - this.historyBoundaryElapsedMs;
      const segmentEnd = Math.min(nowMs, cursor + remainingBoundaryMs);
      const segmentMs = segmentEnd - cursor;
      const segmentSeconds = segmentMs / 1_000;
      this.engine.stepAccumulator += segmentSeconds * 60 * this.engine.playbackSpeed;
      completed += await this.drain(nowMs);
      cursor = segmentEnd;
      this.historyBoundaryElapsedMs += segmentMs;
      if (this.historyBoundaryElapsedMs >= HISTORY_BOUNDARY_MS - Number.EPSILON) {
        this.historyBoundaryElapsedMs = 0;
        this.callbacks.historyBoundary?.();
      }
    }
    this.lastTickMs = nowMs;
    this.checkOverload(nowMs);
    return completed;
  }

  singleStep() {
    this.engine.playing = false;
    this.resetOrigin();
    const committed = this.engine.step(0);
    if (committed) this.callbacks.stepCommitted?.();
    return committed;
  }

  private async drain(nowMs: number) {
    let completed = 0;
    let inTask = 0;
    while (this.engine.playing && this.engine.stepAccumulator >= 1) {
      const activeWallSeconds = 1 / (60 * this.engine.playbackSpeed);
      if (!this.engine.step(activeWallSeconds)) break;
      this.callbacks.stepCommitted?.();
      this.engine.stepAccumulator -= 1;
      completed += 1;
      inTask += 1;
      if (inTask === MAX_STEPS_PER_TASK && this.engine.stepAccumulator >= 1) {
        this.callbacks.yielded?.();
        await new Promise<void>((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => {
            channel.port1.close();
            channel.port2.close();
            resolve();
          };
          channel.port2.postMessage(null);
        });
        inTask = 0;
        this.checkOverload(nowMs);
      }
    }
    return completed;
  }

  private checkOverload(nowMs: number) {
    const backlogLimit = 60 * this.engine.playbackSpeed;
    if (this.engine.stepAccumulator <= backlogLimit) {
      this.overloadStartedMs = null;
      return;
    }
    this.overloadStartedMs ??= nowMs;
    if (nowMs - this.overloadStartedMs >= 5_000) {
      this.engine.playing = false;
      this.resetOrigin();
      this.callbacks.overload?.();
    }
  }
}
