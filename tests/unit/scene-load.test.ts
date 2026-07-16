import { describe, expect, it, vi } from "vitest";
import { FIRST_LIGHT } from "../../src/domain/defaults";
import { AtomicSceneLoader, validateSceneImport } from "../../src/persistence/sceneLoad";

const portable = (generationVersion = 1) => ({
  kind: "galaxia-scene",
  schemaVersion: 1,
  generationVersion,
  appVersion: "0.1.0",
  id: "scene-1",
  name: "Scene",
  exportedAt: "2026-07-15T00:00:00.000Z",
  payload: {
    galaxies: [FIRST_LIGHT],
    gravity: 2,
    playbackSpeed: 0.5,
    performanceLevel: "high",
    trails: true,
  },
});
describe("atomic scene load", () => {
  it("rejects parse/schema faults before requesting a snapshot", async () => {
    await expect(validateSceneImport(new File(["{"], "bad.json"))).rejects.toThrow(
      "INVALID_IMPORT",
    );
    await expect(
      validateSceneImport(new File([JSON.stringify({ ...portable(), extra: true })], "bad.json")),
    ).rejects.toThrow("INVALID_IMPORT");
  });
  it("requires explicit confirmation for a different valid generation version", async () => {
    const scene = await validateSceneImport(
      new File([JSON.stringify(portable(2))], "future-generation.json"),
    );
    expect(scene.requiresGenerationConfirmation).toBe(true);
  });
  it("commits exact success UI and one undo entry", async () => {
    const client = {
        requestUndoSnapshot: vi.fn(() => Promise.resolve({ snapshotId: "s" })),
        mutation: vi.fn(() => Promise.resolve()),
        release: vi.fn(() => Promise.resolve()),
      },
      commit = vi.fn(),
      push = vi.fn(),
      loader = new AtomicSceneLoader(client, () => ({ mode: "single" }), vi.fn(), commit, push),
      validated = await validateSceneImport(new File([JSON.stringify(portable())], "scene.json"));
    await loader.load(validated);
    expect(commit).toHaveBeenCalledWith({
      mode: "builder",
      selectedGalaxyId: null,
      automaticFraming: true,
      performanceLevel: "high",
      trails: true,
      playing: false,
    });
    expect(push).toHaveBeenCalledExactlyOnceWith("s", { mode: "single" });
  });
  it("rolls engine and UI back when UI commit throws", async () => {
    const order: string[] = [],
      client = {
        requestUndoSnapshot: vi.fn(() => Promise.resolve({ snapshotId: "s" })),
        mutation: vi.fn((type: string) => {
          order.push(type);
          return Promise.resolve();
        }),
        release: vi.fn(() => {
          order.push("release");
          return Promise.resolve();
        }),
      },
      restore = vi.fn(() => order.push("restore-ui")),
      loader = new AtomicSceneLoader(
        client,
        () => ({ digest: "before" }),
        restore,
        () => {
          throw new Error("UI_COMMIT_FAILED");
        },
        vi.fn(),
      ),
      validated = await validateSceneImport(new File([JSON.stringify(portable())], "scene.json"));
    await expect(loader.load(validated)).rejects.toThrow("UI_COMMIT_FAILED");
    expect(order).toEqual(["LOAD_SETUP", "restore-ui", "RESTORE_UNDO_SNAPSHOT", "release"]);
  });
});
