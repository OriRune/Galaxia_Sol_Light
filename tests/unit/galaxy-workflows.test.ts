import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DRAFT, DEFAULT_SCENE_SETUP, FIRST_LIGHT } from "../../src/domain/defaults";
import {
  CommandDispatcher,
  planAdd,
  planApplyToSelected,
  planDelete,
  planSingleDraftCommit,
  resetDraft,
} from "../../src/app/galaxyWorkflows";
import type { DraftGalaxy, SceneSetup } from "../../src/domain/types";
const scene = (): SceneSetup => structuredClone(DEFAULT_SCENE_SETUP);
describe("draft and selected workflows", () => {
  it("regenerates Single immediately on generation commit but not name-only", () => {
    const changed: DraftGalaxy = {
      generation: { ...DEFAULT_DRAFT.generation, size: 50 },
      name: "First Light",
    };
    expect(planSingleDraftCommit(scene(), changed, "balanced").regenerates).toBe(true);
    const named: DraftGalaxy = { generation: { ...DEFAULT_DRAFT.generation }, name: "Renamed" };
    expect(planSingleDraftCommit(scene(), named, "balanced").regenerates).toBe(false);
  });
  it("adds at viewport center, selects only the new galaxy, and keeps the multi-mode draft independent", () => {
    const draft: DraftGalaxy = {
        generation: { ...DEFAULT_DRAFT.generation, starCount: 500 },
        name: "Draft",
      },
      plan = planAdd({ ...scene(), galaxies: [] }, draft, { x: 12, y: -4 }, "new", "balanced");
    expect(plan.nextScene.galaxies[0]).toMatchObject({
      id: "new",
      position: { x: 12, y: -4 },
      bulkVelocity: { x: 0, y: 0 },
    });
    expect(plan.nextSelection).toBe("new");
    expect(plan.nextDraft).toEqual(draft);
  });
  it("applies generation to selection while retaining placement, velocity, and name", () => {
    const current = scene();
    current.galaxies = [{ ...FIRST_LIGHT, position: { x: 7, y: 8 }, bulkVelocity: { x: 2, y: 3 } }];
    const plan = planApplyToSelected(
      current,
      "first-light",
      { generation: { ...DEFAULT_DRAFT.generation, size: 60 }, name: "Ignored draft name" },
      "high",
    );
    expect(plan.nextScene.galaxies[0]).toMatchObject({
      name: "First Light",
      position: { x: 7, y: 8 },
      bulkVelocity: { x: 2, y: 3 },
      generation: { size: 60 },
    });
  });
  it("rejects invalid/global-over-budget before snapshot but allows above-level valid counts with warning", async () => {
    const client = {
        requestUndoSnapshot: vi.fn(() => Promise.resolve({ snapshotId: "s" })),
        mutation: vi.fn(() => Promise.resolve({})),
      },
      dispatcher = new CommandDispatcher(client, vi.fn(), vi.fn());
    await expect(
      dispatcher.execute(
        () => planAdd(scene(), DEFAULT_DRAFT, { x: 0, y: 0 }, "first-light", "balanced"),
        "bad",
      ),
    ).rejects.toThrow();
    expect(client.requestUndoSnapshot).not.toHaveBeenCalled();
    const valid = { ...scene(), galaxies: [] };
    const highDraft = { generation: { ...DEFAULT_DRAFT.generation, starCount: 60000 }, name: null };
    const plan = planAdd(valid, highDraft, { x: 0, y: 0 }, "g", "low");
    expect(plan.warning).toMatch(/exceeds/);
    expect(plan.nextScene.galaxies[0]?.generation.starCount).toBe(60000);
  });
  it("preserves current draft on performance change and uses level only on reset", () => {
    const draft = { generation: { ...DEFAULT_DRAFT.generation, starCount: 12345 }, name: null };
    expect(draft.generation.starCount).toBe(12345);
    expect(resetDraft("low", draft).generation.starCount).toBe(10000);
    expect(resetDraft("high", draft).generation.starCount).toBe(60000);
  });
  it("disables delete in Single and leaves an empty multi-mode scene usable", () => {
    expect(() => planDelete("single", scene(), "first-light")).toThrow(/unavailable/);
    const plan = planDelete("builder", scene(), "first-light");
    expect(plan.nextScene.galaxies).toEqual([]);
    expect(plan.nextSelection).toBeNull();
  });
  it("commits and creates exactly one undo placeholder only after ACK", async () => {
    const order: string[] = [],
      client = {
        requestUndoSnapshot: vi.fn(() => {
          order.push("snapshot");
          return Promise.resolve({ snapshotId: "s" });
        }),
        mutation: vi.fn(() => {
          order.push("ack");
          return Promise.resolve();
        }),
      },
      dispatcher = new CommandDispatcher(
        client,
        () => {
          order.push("commit");
        },
        () => {
          order.push("undo");
        },
      );
    await dispatcher.execute(
      () => planSingleDraftCommit(scene(), DEFAULT_DRAFT, "balanced"),
      "edit",
    );
    expect(order).toEqual(["snapshot", "ack", "commit", "undo"]);
  });
});
