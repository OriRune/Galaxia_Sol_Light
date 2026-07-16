import { describe, expect, it } from "vitest";
import {
  RECORDING_RESERVE_BYTES,
  RecordingSlotScheduler,
  nearestRankP95,
  recordingCapacity,
} from "../../src/capture/recordingScheduler";
describe("recording preflight and scheduler", () => {
  it("uses five-frame nearest-rank p95 and quota formula", () => {
    expect(nearestRankP95([10, 30, 20, 50, 40])).toBe(50);
    expect(
      recordingCapacity([100, 100, 100, 100, 100], {
        quota: RECORDING_RESERVE_BYTES + 125 * 600,
        usage: 0,
      }),
    ).toMatchObject({
      budgetedFrameBytes: 125,
      effectiveSlotLimit: 600,
      safeToStart: true,
      estimateAvailable: true,
    });
    expect(recordingCapacity([100], {})).toMatchObject({
      effectiveSlotLimit: 3600,
      estimateAvailable: false,
    });
  });
  it("refuses fewer than 300 safe slots", () => {
    expect(
      recordingCapacity([100], { quota: RECORDING_RESERVE_BYTES + 125 * 299, usage: 0 })
        .safeToStart,
    ).toBe(false);
  });
  it("attempts only the newest due slot and never backfills", () => {
    const scheduler = new RecordingSlotScheduler(0, 3600);
    expect(scheduler.pass(100, 0)).toEqual({
      candidate: 2,
      missed: [0, 1],
      nextSlot: 3,
      lastAttemptedSlot: 2,
      nominalSlots: 3,
    });
    expect(scheduler.pass(110, 0)).toBeNull();
    expect(scheduler.pass(200, 2)).toEqual({
      candidate: null,
      missed: [3, 5],
      nextSlot: 6,
      lastAttemptedSlot: 5,
      nominalSlots: 6,
    });
  });
  it("marks every hidden elapsed slot missed and resumes at the next slot", () => {
    const scheduler = new RecordingSlotScheduler(0, 3600);
    scheduler.hide(0);
    expect(scheduler.pass(1000, 0)).toBeNull();
    expect(scheduler.show(1000)).toEqual({
      candidate: null,
      missed: [0, 29],
      nextSlot: 30,
      lastAttemptedSlot: 29,
      nominalSlots: 30,
    });
    expect(scheduler.pass(1034, 0)?.candidate).toBe(30);
  });
  it("makes slot 299 due exactly at ten seconds", () => {
    expect(new RecordingSlotScheduler(0, 300).pass(10_000, 0)?.lastAttemptedSlot).toBe(299);
  });
});
