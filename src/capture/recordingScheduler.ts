export const RECORDING_FPS = 30;
export const MAX_RECORDING_SLOTS = 3600;
export const MIN_RECORDING_SLOTS = 300;
export const RECORDING_RESERVE_BYTES = 2 * 64 * 1024 * 1024;
export const MAX_RECORDING_IN_FLIGHT = 2;

export function nearestRankP95(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Preflight requires samples.");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}
export interface PreflightCapacity {
  budgetedFrameBytes: number;
  effectiveSlotLimit: number;
  estimateAvailable: boolean;
  safeToStart: boolean;
}
export function recordingCapacity(
  sampleBytes: readonly number[],
  estimate: { quota?: number; usage?: number },
): PreflightCapacity {
  const budgetedFrameBytes = Math.ceil(1.25 * nearestRankP95(sampleBytes));
  if (estimate.quota === undefined || estimate.usage === undefined)
    return {
      budgetedFrameBytes,
      effectiveSlotLimit: MAX_RECORDING_SLOTS,
      estimateAvailable: false,
      safeToStart: true,
    };
  const free = Math.max(0, estimate.quota - estimate.usage),
    capacity = Math.floor(Math.max(0, free - RECORDING_RESERVE_BYTES) / budgetedFrameBytes),
    effectiveSlotLimit = Math.min(
      MAX_RECORDING_SLOTS,
      Math.floor(capacity / RECORDING_FPS) * RECORDING_FPS,
    );
  return {
    budgetedFrameBytes,
    effectiveSlotLimit,
    estimateAvailable: true,
    safeToStart: effectiveSlotLimit >= MIN_RECORDING_SLOTS,
  };
}

export interface SchedulerPass {
  candidate: number | null;
  missed: [number, number] | null;
  nextSlot: number;
  lastAttemptedSlot: number;
  nominalSlots: number;
}
export class RecordingSlotScheduler {
  private nextSlot = 0;
  private hiddenAt: number | null = null;
  constructor(
    private readonly startMs: number,
    private readonly effectiveSlotLimit: number,
  ) {}
  pass(nowMs: number, inFlight: number): SchedulerPass | null {
    if (this.hiddenAt !== null) return null;
    const dueExclusive = Math.min(
      this.effectiveSlotLimit,
      Math.floor(((nowMs - this.startMs) * RECORDING_FPS) / 1000),
    );
    if (dueExclusive <= this.nextSlot) return null;
    const candidate = dueExclusive - 1,
      missedEnd = inFlight < MAX_RECORDING_IN_FLIGHT ? candidate - 1 : candidate,
      result: SchedulerPass = {
        candidate: inFlight < MAX_RECORDING_IN_FLIGHT ? candidate : null,
        missed: missedEnd >= this.nextSlot ? [this.nextSlot, missedEnd] : null,
        nextSlot: dueExclusive,
        lastAttemptedSlot: candidate,
        nominalSlots: candidate + 1,
      };
    this.nextSlot = dueExclusive;
    return result;
  }
  hide(nowMs: number): void {
    this.hiddenAt ??= nowMs;
  }
  show(nowMs: number): SchedulerPass | null {
    if (this.hiddenAt === null) return null;
    this.hiddenAt = null;
    const dueExclusive = Math.min(
      this.effectiveSlotLimit,
      Math.floor(((nowMs - this.startMs) * RECORDING_FPS) / 1000),
    );
    if (dueExclusive <= this.nextSlot) return null;
    const result: SchedulerPass = {
      candidate: null,
      missed: [this.nextSlot, dueExclusive - 1],
      nextSlot: dueExclusive,
      lastAttemptedSlot: dueExclusive - 1,
      nominalSlots: dueExclusive,
    };
    this.nextSlot = dueExclusive;
    return result;
  }
}
