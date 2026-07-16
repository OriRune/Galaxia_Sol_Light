import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import {
  LibraryDatabase,
  RecordingFrameDatabase,
  openDatabases,
  requestDurableStorage,
} from "../../src/persistence/databases";

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all([Dexie.delete("galaxia-library"), Dexie.delete("galaxia-recording-frames")]);
});

describe("library databases", () => {
  it("opens the exact version-one stores and indexes", async () => {
    const { library, frames } = await openDatabases();
    expect(library.name).toBe("galaxia-library");
    expect(frames.name).toBe("galaxia-recording-frames");
    expect(library.tables.map((table) => table.name)).toEqual([
      "presets",
      "scenes",
      "captures",
      "recordings",
    ]);
    expect(frames.frames.schema.primKey.src).toBe("[recordingId+slot]");
    library.close();
    frames.close();
  });

  it("supports an additive test migration", async () => {
    const database = new LibraryDatabase();
    database.version(2).stores({ presets: "&id, normalizedName, updatedAt, builtin" });
    await database.open();
    expect(database.presets.schema.indexes.some((index) => index.name === "builtin")).toBe(true);
    database.close();
  });

  it("constructs both databases without opening them from components", () => {
    expect(new LibraryDatabase().isOpen()).toBe(false);
    expect(new RecordingFrameDatabase().isOpen()).toBe(false);
  });

  it("reports every durable-storage capability outcome", async () => {
    vi.stubGlobal("navigator", {});
    await expect(requestDurableStorage()).resolves.toBe("unavailable");
    vi.stubGlobal("navigator", { storage: { persist: () => Promise.resolve(true) } });
    await expect(requestDurableStorage()).resolves.toBe("granted");
    vi.stubGlobal("navigator", { storage: { persist: () => Promise.resolve(false) } });
    await expect(requestDurableStorage()).resolves.toBe("denied");
    vi.stubGlobal("navigator", {
      storage: {
        persist: () => Promise.reject(new Error("denied")),
      },
    });
    await expect(requestDurableStorage()).resolves.toBe("unavailable");
  });
});
