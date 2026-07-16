import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LibraryDatabase } from "../../src/persistence/databases";
import { LibraryRepository } from "../../src/persistence/libraryRepository";
import { createPresetFile } from "../../src/persistence/portable";
import { DEFAULT_DRAFT } from "../../src/domain/defaults";

let database: LibraryDatabase, repository: LibraryRepository;
beforeEach(async () => {
  database = new LibraryDatabase();
  await database.open();
  repository = new LibraryRepository(database);
});
afterEach(async () => {
  database.close();
  await Dexie.delete("galaxia-library");
});
const preset = (id: string, name: string, builtin = false) => ({
  id,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  builtin,
  portable: createPresetFile(
    {
      id,
      name,
      appVersion: "0.1.0",
      exportedAt: "2026-01-01T00:00:00.000Z",
    },
    DEFAULT_DRAFT,
  ),
});

describe("library repository", () => {
  it("suffixes saves atomically and never overwrites", async () => {
    expect((await repository.savePreset(preset("a", "Name"))).name).toBe("Name");
    expect((await repository.savePreset(preset("b", "name"))).name).toBe("name (2)");
    expect(await database.presets.count()).toBe(2);
    expect((await database.presets.get("b"))?.portable).toMatchObject({ name: "name (2)" });
  });
  it("rejects rename collisions", async () => {
    await repository.savePreset(preset("a", "One"));
    await repository.savePreset(preset("b", "Two"));
    await expect(repository.rename("preset", "b", " one ")).rejects.toThrow("NAME_COLLISION");
    await repository.rename("preset", "b", "Three");
    expect((await database.presets.get("b"))?.portable).toMatchObject({ name: "Three" });
  });
  it("protects built-ins from rename and delete", async () => {
    await repository.savePreset(preset("builtin", "Built in", true));
    await expect(repository.rename("preset", "builtin", "Other")).rejects.toThrow(
      "BUILTIN_PROTECTED",
    );
    await expect(repository.delete("preset", "builtin")).rejects.toThrow("BUILTIN_PROTECTED");
  });
  it("returns summaries without portable or Blob content", async () => {
    await repository.savePreset(preset("a", "One"));
    expect(await repository.list("preset")).toEqual([
      {
        id: "a",
        name: "One",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        builtin: false,
      },
    ]);
  });
});
