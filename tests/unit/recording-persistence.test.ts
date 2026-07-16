import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RecordingPersistence } from "../../src/capture/recordingPersistence";
import {
  LibraryDatabase,
  RecordingFrameDatabase,
  type RecordingRow,
} from "../../src/persistence/databases";
let library: LibraryDatabase, frames: RecordingFrameDatabase, persistence: RecordingPersistence;
beforeEach(async () => {
  library = new LibraryDatabase();
  frames = new RecordingFrameDatabase();
  await Promise.all([library.open(), frames.open()]);
  persistence = new RecordingPersistence(library, frames);
});
afterEach(async () => {
  library.close();
  frames.close();
  await Promise.all([Dexie.delete("galaxia-library"), Dexie.delete("galaxia-recording-frames")]);
});
const row = (): RecordingRow => ({
  id: "r",
  name: "R",
  normalizedName: "r",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  state: "recording",
  width: 100,
  height: 100,
  devicePixelRatio: 1,
  mimeType: "image/png",
  nominalSlots: 0,
  capturedCount: 0,
  missedCount: 0,
  lastAttemptedSlot: -1,
  startedAtWall: "2026-01-01T00:00:00Z",
  startedAtMonotonic: 0,
  durationMs: 0,
  effectiveSlotLimit: 300,
  terminalReason: "user",
  missedRanges: [],
});
describe("recording persistence", () => {
  it("writes frame before incrementing metadata and reconciles counts", async () => {
    await library.recordings.add(row());
    await persistence.attemptMetadata("r", 2, [0, 1]);
    await persistence.writeFrame("r", 2, 100, new Blob(["x"], { type: "image/png" }));
    const final = await persistence.finalize("r", "user");
    expect(final).toMatchObject({
      state: "complete",
      nominalSlots: 3,
      capturedCount: 1,
      missedCount: 2,
      missedRanges: [[0, 1]],
      durationMs: 100,
    });
  });
  it.each(["duration", "quota", "encoder"] as const)(
    "records terminal reason %s",
    async (reason) => {
      await library.recordings.add(row());
      await persistence.attemptMetadata("r", 0, null);
      expect(await persistence.finalize("r", reason)).toMatchObject({
        terminalReason: reason,
        state: reason === "duration" ? "complete" : "failed",
      });
    },
  );
});
