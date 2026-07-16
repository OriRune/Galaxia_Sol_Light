import type { DraftGalaxy, GalaxyRecord, Mode, SceneSetup } from "../domain/types";

export type ModeSceneResult = { kind: "preserve" } | { kind: "replace"; setup: SceneSetup };
export interface ModeTransition {
  mode: Mode;
  scene: ModeSceneResult;
  draft: DraftGalaxy;
  selectedGalaxyId: string | null;
  camera: "preserve" | "enable";
  undoable: boolean;
  workerCommand: { type: "LOAD_SETUP"; postLoadPlaying: boolean } | null;
}
export interface ModeTransitionContext {
  mode: Mode;
  target: Mode;
  scene: SceneSetup;
  draft: DraftGalaxy;
  selectedGalaxyId: string | null;
  playing: boolean;
  createId: () => string;
}
const copyDraft = (record: Pick<GalaxyRecord, "generation" | "name">): DraftGalaxy => ({
  generation: { ...record.generation },
  name: record.name,
});
export function reduceMode(context: ModeTransitionContext): ModeTransition {
  const base: ModeTransition = {
    mode: context.target,
    scene: { kind: "preserve" },
    draft: copyDraft(context.draft),
    selectedGalaxyId: context.selectedGalaxyId,
    camera: "preserve",
    undoable: false,
    workerCommand: null,
  };
  if (context.target === context.mode) return base;
  if (context.target === "single") {
    const liveSelected = context.scene.galaxies.find(
        (record) => record.id === context.selectedGalaxyId,
      ),
      retained = liveSelected ?? context.scene.galaxies[0];
    const id = retained?.id ?? context.createId(),
      source = retained ?? { generation: context.draft.generation, name: context.draft.name };
    const galaxy: GalaxyRecord = {
      id,
      generation: { ...source.generation },
      name: source.name,
      position: { x: 0, y: 0 },
      bulkVelocity: { x: 0, y: 0 },
    };
    return {
      mode: "single",
      scene: { kind: "replace", setup: { ...context.scene, galaxies: [galaxy] } },
      draft: copyDraft(galaxy),
      selectedGalaxyId: id,
      camera: "enable",
      undoable: true,
      workerCommand: { type: "LOAD_SETUP", postLoadPlaying: context.playing },
    };
  }
  if (
    context.mode === "single" &&
    (context.target === "collision" || context.target === "builder")
  ) {
    const sole = context.scene.galaxies[0];
    return { ...base, draft: sole ? copyDraft(sole) : base.draft };
  }
  return base;
}
