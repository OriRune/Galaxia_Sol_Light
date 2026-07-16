import { PERFORMANCE_STAR_BUDGETS } from "../domain/ranges";
import { validateSceneSetup } from "../domain/validation";
import type {
  DraftGalaxy,
  GalaxyRecord,
  Mode,
  PerformanceLevel,
  SceneSetup,
  Vec2,
} from "../domain/types";
export interface WorkflowPlan {
  command: { type: "PATCH_GALAXY" | "ADD_GALAXY" | "DELETE_GALAXY"; payload: unknown };
  nextScene: SceneSetup;
  nextDraft: DraftGalaxy;
  nextSelection: string | null;
  warning: string | null;
  regenerates: boolean;
}
function warning(scene: SceneSetup, level: PerformanceLevel): string | null {
  return scene.galaxies.reduce((sum, record) => sum + record.generation.starCount, 0) >
    PERFORMANCE_STAR_BUDGETS[level]
    ? `Scene exceeds the ${level} automatic budget.`
    : null;
}
function checked(scene: SceneSetup): SceneSetup {
  return validateSceneSetup(scene);
}
export function planSingleDraftCommit(
  scene: SceneSetup,
  draft: DraftGalaxy,
  level: PerformanceLevel,
): WorkflowPlan {
  const current = scene.galaxies[0];
  if (!current) throw new Error("Single mode requires one galaxy.");
  const regenerates = JSON.stringify(current.generation) !== JSON.stringify(draft.generation),
    record = { ...current, generation: { ...draft.generation }, name: draft.name };
  const nextScene = checked({ ...scene, galaxies: [record] });
  return {
    command: {
      type: "PATCH_GALAXY",
      payload: { galaxyId: current.id, generation: record.generation, name: record.name },
    },
    nextScene,
    nextDraft: { generation: { ...draft.generation }, name: draft.name },
    nextSelection: current.id,
    warning: warning(nextScene, level),
    regenerates,
  };
}
export function planAdd(
  scene: SceneSetup,
  draft: DraftGalaxy,
  center: Vec2,
  id: string,
  level: PerformanceLevel,
): WorkflowPlan {
  const record: GalaxyRecord = {
      id,
      generation: { ...draft.generation },
      name: draft.name,
      position: { ...center },
      bulkVelocity: { x: 0, y: 0 },
    },
    nextScene = checked({ ...scene, galaxies: [...scene.galaxies, record] });
  return {
    command: { type: "ADD_GALAXY", payload: { galaxy: record } },
    nextScene,
    nextDraft: { generation: { ...draft.generation }, name: draft.name },
    nextSelection: id,
    warning: warning(nextScene, level),
    regenerates: true,
  };
}
export function planApplyToSelected(
  scene: SceneSetup,
  selectedId: string,
  draft: DraftGalaxy,
  level: PerformanceLevel,
): WorkflowPlan {
  const index = scene.galaxies.findIndex((record) => record.id === selectedId);
  if (index < 0) throw new Error("Selected galaxy is unavailable.");
  const current = scene.galaxies[index];
  if (!current) throw new Error("Selected galaxy is unavailable.");
  const regenerates = JSON.stringify(current.generation) !== JSON.stringify(draft.generation),
    record = { ...current, generation: { ...draft.generation } };
  const galaxies = [...scene.galaxies];
  galaxies[index] = record;
  const nextScene = checked({ ...scene, galaxies });
  return {
    command: {
      type: "PATCH_GALAXY",
      payload: { galaxyId: current.id, generation: record.generation, name: current.name },
    },
    nextScene,
    nextDraft: { generation: { ...draft.generation }, name: draft.name },
    nextSelection: selectedId,
    warning: warning(nextScene, level),
    regenerates,
  };
}
export function planDelete(mode: Mode, scene: SceneSetup, selectedId: string): WorkflowPlan {
  if (mode === "single") throw new Error("Delete is unavailable in Single mode.");
  const current = scene.galaxies.find((record) => record.id === selectedId);
  if (!current) throw new Error("Selected galaxy is unavailable.");
  const nextScene = checked({
    ...scene,
    galaxies: scene.galaxies.filter((record) => record.id !== selectedId),
  });
  return {
    command: { type: "DELETE_GALAXY", payload: { galaxyId: selectedId } },
    nextScene,
    nextDraft: { generation: { ...current.generation }, name: current.name },
    nextSelection: null,
    warning: null,
    regenerates: false,
  };
}
export function resetDraft(level: PerformanceLevel, base: DraftGalaxy): DraftGalaxy {
  return {
    generation: { ...base.generation, starCount: PERFORMANCE_STAR_BUDGETS[level] },
    name: base.name,
  };
}

export interface DispatcherClient {
  requestUndoSnapshot: () => Promise<{ snapshotId: string }>;
  mutation: (type: string, payload: unknown, snapshotId: string) => Promise<unknown>;
  mutationRelease?: (snapshotId: string) => Promise<unknown>;
}
export class CommandDispatcher {
  private locked = false;
  constructor(
    private readonly client: DispatcherClient,
    private readonly commit: (plan: WorkflowPlan) => void,
    private readonly pushUndo: (snapshotId: string, description: string) => void,
  ) {}
  get pending(): boolean {
    return this.locked;
  }
  async execute(planFactory: () => WorkflowPlan, description: string): Promise<WorkflowPlan> {
    if (this.locked) throw new Error("MUTATION_BUSY");
    const plan = planFactory();
    this.locked = true;
    let snapshotId: string | null = null;
    try {
      snapshotId = (await this.client.requestUndoSnapshot()).snapshotId;
      await this.client.mutation(plan.command.type, plan.command.payload, snapshotId);
      this.commit(plan);
      this.pushUndo(snapshotId, description);
      return plan;
    } catch (error) {
      if (snapshotId && this.client.mutationRelease)
        await this.client.mutationRelease(snapshotId).catch(() => undefined);
      throw error;
    } finally {
      this.locked = false;
    }
  }
}
