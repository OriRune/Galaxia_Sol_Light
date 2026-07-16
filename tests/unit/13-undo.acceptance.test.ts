import { expect, it, vi } from "vitest";
import { UndoCoordinator, UndoStore } from "../../src/app/undoStore";

it("scenario 13 restores engine before UI and consumes the undo entry", async () => {
  const order: string[] = [];
  const store = new UndoStore(vi.fn());
  store.push({ snapshotId: "snapshot-1", uiSnapshot: { mode: "builder" } });
  const coordinator = new UndoCoordinator(
    store,
    {
      command: vi.fn(() => Promise.resolve(order.push("pause"))),
      mutation: vi.fn(() => Promise.resolve(order.push("engine"))),
      release: vi.fn(() => Promise.resolve(order.push("release"))),
    },
    () => order.push("ui"),
  );
  await expect(coordinator.undo()).resolves.toBe(true);
  expect(order).toEqual(["pause", "engine", "ui", "release"]);
  expect(store.depth).toBe(0);
});
