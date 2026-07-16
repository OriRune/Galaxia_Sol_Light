import { describe, expect, it } from "vitest";
import { DEFAULT_DRAFT, FIRST_LIGHT } from "../../src/domain/defaults";
import { reduceMode } from "../../src/app/modeReducer";
import type { Mode, SceneSetup } from "../../src/domain/types";
const modes: Mode[] = ["single", "collision", "builder", "random"],
  scene: SceneSetup = {
    galaxies: [{ ...FIRST_LIGHT, position: { x: 9, y: 4 }, bulkVelocity: { x: 1, y: 2 } }],
    gravity: 2,
    playbackSpeed: 0.5,
    performanceLevel: "high",
    trails: true,
  };
describe("mode reducer table", () => {
  it("implements every from/to row and every same-mode no-op", () => {
    for (const from of modes)
      for (const target of modes) {
        const result = reduceMode({
          mode: from,
          target,
          scene,
          draft: { generation: { ...DEFAULT_DRAFT.generation }, name: null },
          selectedGalaxyId: "first-light",
          playing: false,
          createId: () => "created",
        });
        if (from === target) {
          expect(result.scene.kind).toBe("preserve");
          expect(result.workerCommand).toBeNull();
          expect(result.undoable).toBe(false);
          expect(result.camera).toBe("preserve");
        } else if (target === "single") {
          expect(result.scene.kind).toBe("replace");
          expect(result.workerCommand).toEqual({ type: "LOAD_SETUP", postLoadPlaying: false });
          expect(result.undoable).toBe(true);
          expect(result.camera).toBe("enable");
        } else {
          expect(result.scene.kind).toBe("preserve");
          expect(result.undoable).toBe(false);
          expect(result.camera).toBe("preserve");
        }
      }
  });
  it("applies selected, first, then draft replacement precedence for every non-Single entry", () => {
    for (const from of ["collision", "builder", "random"] as const) {
      const selected = {
          ...FIRST_LIGHT,
          id: "selected",
          position: { x: 3, y: 4 },
          bulkVelocity: { x: 2, y: 1 },
        },
        first = { ...FIRST_LIGHT, id: "first" };
      const selectedResult = reduceMode({
        mode: from,
        target: "single",
        scene: { ...scene, galaxies: [first, selected] },
        draft: DEFAULT_DRAFT,
        selectedGalaxyId: "selected",
        playing: true,
        createId: () => "new",
      });
      expect(
        selectedResult.scene.kind === "replace" && selectedResult.scene.setup.galaxies[0],
      ).toMatchObject({ id: "selected", position: { x: 0, y: 0 }, bulkVelocity: { x: 0, y: 0 } });
      const firstResult = reduceMode({
        mode: from,
        target: "single",
        scene: { ...scene, galaxies: [first] },
        draft: DEFAULT_DRAFT,
        selectedGalaxyId: null,
        playing: true,
        createId: () => "new",
      });
      expect(firstResult.selectedGalaxyId).toBe("first");
      const empty = reduceMode({
        mode: from,
        target: "single",
        scene: { ...scene, galaxies: [] },
        draft: DEFAULT_DRAFT,
        selectedGalaxyId: null,
        playing: true,
        createId: () => "new",
      });
      expect(empty.selectedGalaxyId).toBe("new");
      expect(empty.draft).toEqual(DEFAULT_DRAFT);
    }
  });
  it("copies Single into Collision/Builder draft while Random entry and multi-mode changes preserve", () => {
    for (const target of ["collision", "builder"] as const)
      expect(
        reduceMode({
          mode: "single",
          target,
          scene,
          draft: DEFAULT_DRAFT,
          selectedGalaxyId: null,
          playing: true,
          createId: () => "x",
        }).draft.name,
      ).toBe("First Light");
    expect(
      reduceMode({
        mode: "single",
        target: "random",
        scene,
        draft: DEFAULT_DRAFT,
        selectedGalaxyId: null,
        playing: true,
        createId: () => "x",
      }).draft,
    ).toEqual(DEFAULT_DRAFT);
    for (const [from, target] of [
      ["collision", "builder"],
      ["builder", "collision"],
      ["random", "builder"],
    ] as const)
      expect(
        reduceMode({
          mode: from,
          target,
          scene,
          draft: DEFAULT_DRAFT,
          selectedGalaxyId: "first-light",
          playing: true,
          createId: () => "x",
        }).scene.kind,
      ).toBe("preserve");
  });
});
