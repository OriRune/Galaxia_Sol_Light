import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  LibraryDatabase,
  RecordingFrameDatabase,
  type RecordingRow,
} from "../../src/persistence/databases";
import { RecordingRepository } from "../../src/persistence/recordingRepository";

let library: LibraryDatabase;
let frames: RecordingFrameDatabase;
let repository: RecordingRepository;

const row = (id: string, name: string, createdAt = "2026-01-01T00:00:00.000Z") =>
  ({
    id,
    name,
    normalizedName: name.toLowerCase(),
    createdAt,
    updatedAt: createdAt,
    state: "complete",
    width: 2,
    height: 2,
    devicePixelRatio: 1,
    mimeType: "image/webp",
    nominalSlots: 2,
    capturedCount: 2,
    missedCount: 0,
    lastAttemptedSlot: 1,
    startedAtWall: createdAt,
    startedAtMonotonic: 0,
    durationMs: 100,
    effectiveSlotLimit: 2,
    terminalReason: "user",
    missedRanges: [],
  }) satisfies RecordingRow;

beforeEach(async () => {
  library = new LibraryDatabase();
  frames = new RecordingFrameDatabase();
  await Promise.all([library.open(), frames.open()]);
  repository = new RecordingRepository(library, frames);
});

afterEach(async () => {
  library.close();
  frames.close();
  await Promise.all([Dexie.delete("galaxia-library"), Dexie.delete("galaxia-recording-frames")]);
});

describe("recording repository", () => {
  it("allocates unique recording names atomically", async () => {
    expect((await repository.save(row("a", "Recording"))).name).toBe("Recording");
    expect((await repository.save(row("b", "Recording"))).name).toBe("Recording (2)");
  });

  it("lists newest first and navigates previews in both directions", async () => {
    await library.recordings.bulkAdd([
      row("a", "Alpha"),
      row("b", "Beta", "2026-01-02T00:00:00.000Z"),
    ]);
    await frames.frames.bulkAdd(
      [0, 2, 4].map((slot) => ({
        recordingId: "a",
        slot,
        timestampMs: slot * 10,
        mimeType: "image/webp" as const,
        byteLength: 1,
        blob: new Blob([String(slot)]),
      })),
    );
    expect((await repository.list()).map(({ id }) => id)).toEqual(["b", "a"]);
    expect((await repository.detail("a")).preview?.slot).toBe(0);
    expect((await repository.detail("b")).preview).toBeNull();
    await expect(repository.detail("missing")).rejects.toThrow("LIBRARY_ITEM_NOT_FOUND");
    expect((await repository.adjacent("a", 0, 1))?.slot).toBe(2);
    expect((await repository.adjacent("a", 4, -1))?.slot).toBe(2);
    expect(await repository.adjacent("a", 4, 1)).toBeNull();
    expect(await repository.adjacent("a", 0, -1)).toBeNull();
  });

  it("renames uniquely and rejects collisions and missing rows", async () => {
    await library.recordings.bulkAdd([row("a", "Alpha"), row("b", "Beta")]);
    expect(await repository.rename("a", "Gamma")).toBe("Gamma");
    await expect(repository.rename("b", " gamma ")).rejects.toThrow("NAME_COLLISION");
    await expect(repository.rename("missing", "Missing")).rejects.toThrow("LIBRARY_ITEM_NOT_FOUND");
  });

  it("deletes frames in bounded batches and treats a missing recording as a no-op", async () => {
    await library.recordings.add(row("a", "Alpha"));
    await frames.frames.bulkAdd(
      Array.from({ length: 101 }, (_, slot) => ({
        recordingId: "a",
        slot,
        timestampMs: slot,
        mimeType: "image/webp" as const,
        byteLength: 1,
        blob: new Blob(["x"]),
      })),
    );
    let yields = 0;
    await repository.delete("a", () => {
      yields += 1;
      return Promise.resolve();
    });
    expect(yields).toBe(2);
    expect(await frames.frames.count()).toBe(0);
    expect(await library.recordings.count()).toBe(0);
    await expect(repository.delete("missing")).resolves.toBeUndefined();
  });
});
