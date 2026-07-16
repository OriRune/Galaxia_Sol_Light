import { z } from "zod";
import { productNameSchema, sceneSetupSchema, stableIdSchema } from "../domain/schemas";
import type { SceneSetup } from "../domain/types";
import { MAX_PORTABLE_FILE_BYTES, SCHEMA_VERSION } from "../domain/versioning";

const compatibleSceneSchema = z.strictObject({
  kind: z.literal("galaxia-scene"),
  schemaVersion: z.literal(SCHEMA_VERSION),
  generationVersion: z.number().int().positive(),
  appVersion: z.string().min(1),
  id: stableIdSchema,
  name: productNameSchema,
  exportedAt: z.iso.datetime({ offset: true }),
  payload: sceneSetupSchema,
});
export interface ValidatedSceneImport {
  setup: SceneSetup;
  generationVersion: number;
  requiresGenerationConfirmation: boolean;
}
export async function validateSceneImport(file: File): Promise<ValidatedSceneImport> {
  if (file.size > MAX_PORTABLE_FILE_BYTES) throw new Error("INVALID_IMPORT");
  try {
    const parsed = compatibleSceneSchema.parse(JSON.parse(await file.text()));
    return {
      setup: parsed.payload,
      generationVersion: parsed.generationVersion,
      requiresGenerationConfirmation: parsed.generationVersion !== 1,
    };
  } catch {
    throw new Error("INVALID_IMPORT");
  }
}

interface LoadClient {
  requestUndoSnapshot: () => Promise<{ snapshotId: string }>;
  mutation: (type: string, payload: unknown, snapshotId?: string | null) => Promise<unknown>;
  release: (snapshotId: string) => Promise<unknown>;
}
export interface LoadedSceneUi {
  mode: "builder";
  selectedGalaxyId: null;
  automaticFraming: true;
  performanceLevel: SceneSetup["performanceLevel"];
  trails: boolean;
  playing: false;
}
export class AtomicSceneLoader<TUi> {
  constructor(
    private readonly client: LoadClient,
    private readonly readUi: () => TUi,
    private readonly restoreUi: (state: TUi) => void,
    private readonly commitUi: (state: LoadedSceneUi) => void,
    private readonly pushUndo: (snapshotId: string, previousUi: TUi) => void,
  ) {}
  async load(validated: ValidatedSceneImport, generationAccepted = false): Promise<void> {
    if (validated.requiresGenerationConfirmation && !generationAccepted)
      throw new Error("GENERATION_CONFIRMATION_REQUIRED");
    const previousUi = structuredClone(this.readUi()),
      snapshot = await this.client.requestUndoSnapshot();
    let acknowledged = false;
    try {
      await this.client.mutation(
        "LOAD_SETUP",
        {
          setup: {
            galaxies: validated.setup.galaxies,
            gravity: validated.setup.gravity,
            playbackSpeed: validated.setup.playbackSpeed,
          },
          postLoadPlaying: false,
        },
        snapshot.snapshotId,
      );
      acknowledged = true;
      this.commitUi({
        mode: "builder",
        selectedGalaxyId: null,
        automaticFraming: true,
        performanceLevel: validated.setup.performanceLevel,
        trails: validated.setup.trails,
        playing: false,
      });
      this.pushUndo(snapshot.snapshotId, previousUi);
    } catch (error) {
      this.restoreUi(previousUi);
      if (acknowledged)
        await this.client
          .mutation("RESTORE_UNDO_SNAPSHOT", { snapshotId: snapshot.snapshotId })
          .catch(() => undefined);
      await this.client.release(snapshot.snapshotId).catch(() => undefined);
      throw error;
    }
  }
}
