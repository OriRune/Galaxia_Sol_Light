import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupRecordingStorage } from "../../src/persistence/cleanup";
import {
  LibraryDatabase,
  RecordingFrameDatabase,
  type RecordingRow,
} from "../../src/persistence/databases";

let library: LibraryDatabase, frames: RecordingFrameDatabase;
beforeEach(async () => {
  library = new LibraryDatabase();
  frames = new RecordingFrameDatabase();
  await Promise.all([library.open(), frames.open()]);
});
afterEach(async () => {
  library.close();
  frames.close();
  await Promise.all([Dexie.delete("galaxia-library"), Dexie.delete("galaxia-recording-frames")]);
});
const recording = (id: string, state: RecordingRow["state"]): RecordingRow => ({
  id,
  name: id,
  normalizedName: id,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  state,
  width: 10,
  height: 10,
  devicePixelRatio: 1,
  mimeType: "image/png",
  nominalSlots: 4,
  capturedCount: 0,
  missedCount: 0,
  lastAttemptedSlot: 3,
  startedAtWall: "2026-01-01T00:00:00Z",
  startedAtMonotonic: 0,
  durationMs: 100,
  effectiveSlotLimit: 4,
  terminalReason: "user",
  missedRanges: [],
});
const frame = (recordingId: string, slot: number) => ({
  recordingId,
  slot,
  timestampMs: slot * 100,
  mimeType: "image/png" as const,
  byteLength: 1,
  blob: new Blob(["x"]),
});
describe("recording startup cleanup", () => {
  it("finishes deleting and marks prior recording interrupted with exact missing slots", async () => {
    await library.recordings.bulkAdd([
      recording("delete", "deleting"),
      recording("live", "recording"),
    ]);
    await frames.frames.bulkAdd([frame("delete", 0), frame("live", 0), frame("live", 2)]);
    await cleanupRecordingStorage(library, frames);
    expect(await library.recordings.get("delete")).toBeUndefined();
    expect(await frames.frames.where("recordingId").equals("delete").count()).toBe(0);
    expect(await library.recordings.get("live")).toMatchObject({
      state: "interrupted",
      terminalReason: "interrupted",
      capturedCount: 2,
      missedCount: 2,
      missedRanges: [
        [1, 1],
        [3, 3],
      ],
    });
  });
  it("removes orphans in batches of one hundred and yields", async () => {
    await frames.frames.bulkAdd(Array.from({ length: 205 }, (_, slot) => frame("orphan", slot)));
    const yieldTask = vi.fn(() => Promise.resolve());
    await cleanupRecordingStorage(library, frames, yieldTask);
    expect(await frames.frames.count()).toBe(0);
    expect(yieldTask).toHaveBeenCalledTimes(3);
  });
});
