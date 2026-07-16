import { describe, expect, it, vi } from "vitest";
import {
  UNDOABLE_ACTIONS,
  UndoCoordinator,
  UndoStore,
  type UndoUiSnapshot,
} from "../../src/app/undoStore";
describe("undo coordinator", () => {
  it("retains twenty entries outside Zustand and releases the oldest", () => {
    const release = vi.fn(),
      store = new UndoStore(release);
    for (let index = 1; index <= 21; index += 1)
      store.push({
        snapshotId: `s${String(index)}`,
        description: "action",
        uiSnapshot: new ArrayBuffer(8),
      });
    expect(store.depth).toBe(20);
    expect(store.peek()?.snapshotId).toBe("s21");
    expect(release).toHaveBeenCalledExactlyOnceWith("s1");
  });
});

const ui: UndoUiSnapshot = {
  mode: "builder",
  draft: {
    generation: {
      type: "spiral",
      seed: 1,
      starCount: 500,
      size: 40,
      mass: 25,
      spin: 1,
      armCount: 2,
      centralBlackHole: false,
    },
    name: "undo",
  },
  randomCategory: "single",
  randomSeed: 2,
  selectedGalaxyId: "g",
  performanceLevel: "low",
  trails: true,
};

describe("coordinated undo", () => {
  it("defines exactly the closed undoable action set", () => {
    expect(UNDOABLE_ACTIONS).toEqual([
      "addGalaxy",
      "deleteGalaxy",
      "commitGalaxy",
      "moveGalaxy",
      "bulkVelocity",
      "applyPreset",
      "generateRandom",
      "enterSingleReplacingScene",
      "loadScene",
      "gravity",
      "playbackSpeed",
      "performanceLevel",
      "trails",
    ]);
  });

  it("pauses, restores engine/UI, pops and releases with no redo", async () => {
    const release = vi.fn(() => Promise.resolve()),
      store = new UndoStore(release),
      order: string[] = [],
      restoreUi = vi.fn(() => order.push("ui"));
    store.push({ snapshotId: "s1", uiSnapshot: ui });
    const coordinator = new UndoCoordinator(
      store,
      {
        command: vi.fn(() => {
          order.push("pause");
          return Promise.resolve();
        }),
        mutation: vi.fn(() => {
          order.push("engine");
          return Promise.resolve();
        }),
        release: vi.fn((id: string) => {
          order.push(`release:${id}`);
          return Promise.resolve();
        }),
      },
      restoreUi,
    );
    expect(await coordinator.undo()).toBe(true);
    expect(order).toEqual(["pause", "engine", "ui", "release:s1"]);
    expect(restoreUi).toHaveBeenCalledWith(ui);
    expect(store.depth).toBe(0);
    expect(await coordinator.undo()).toBe(false);
  });

  it("keeps the entry and UI unchanged when restore fails", async () => {
    const store = new UndoStore(vi.fn()),
      restoreUi = vi.fn();
    store.push({ snapshotId: "s1", uiSnapshot: ui });
    const coordinator = new UndoCoordinator(
      store,
      {
        command: vi.fn(() => Promise.resolve()),
        mutation: vi.fn(() => Promise.reject(new Error("restore failed"))),
        release: vi.fn(() => Promise.resolve()),
      },
      restoreUi,
    );
    await expect(coordinator.undo()).rejects.toThrow("restore failed");
    expect(store.depth).toBe(1);
    expect(restoreUi).not.toHaveBeenCalled();
  });
});
