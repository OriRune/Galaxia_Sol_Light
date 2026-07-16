import { presetFileV1Schema, sceneFileV1Schema } from "../domain/schemas";
import type {
  DraftGalaxy,
  PerformanceLevel,
  PresetFileV1,
  SceneFileV1,
  SceneSetup,
  Vec2,
} from "../domain/types";
import { GENERATION_VERSION, MAX_PORTABLE_FILE_BYTES, SCHEMA_VERSION } from "../domain/versioning";

export type PortableFile = PresetFileV1 | SceneFileV1;
export async function importPortableFile(file: File): Promise<PortableFile> {
  if (file.size > MAX_PORTABLE_FILE_BYTES) throw new Error("INVALID_IMPORT");
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error("INVALID_IMPORT");
  }
  const preset = presetFileV1Schema.safeParse(value);
  if (preset.success) return preset.data;
  const scene = sceneFileV1Schema.safeParse(value);
  if (scene.success) return scene.data;
  throw new Error("INVALID_IMPORT");
}

export function exportPortableFile(value: PortableFile): Blob {
  const validated =
    value.kind === "galaxia-preset"
      ? presetFileV1Schema.parse(value)
      : sceneFileV1Schema.parse(value);
  return new Blob([`${JSON.stringify(validated, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
}

interface EnvelopeInput {
  id: string;
  name: string;
  appVersion: string;
  exportedAt: string;
}
export function createPresetFile(input: EnvelopeInput, payload: DraftGalaxy): PresetFileV1 {
  return presetFileV1Schema.parse({
    kind: "galaxia-preset",
    schemaVersion: SCHEMA_VERSION,
    generationVersion: GENERATION_VERSION,
    ...input,
    payload,
  });
}
export function createSceneFile(input: EnvelopeInput, payload: SceneSetup): SceneFileV1 {
  return sceneFileV1Schema.parse({
    kind: "galaxia-scene",
    schemaVersion: SCHEMA_VERSION,
    generationVersion: GENERATION_VERSION,
    ...input,
    payload,
  });
}

export async function captureCoherentScene(
  requestSceneSetup: () => Promise<Omit<SceneSetup, "performanceLevel" | "trails">>,
  performanceLevel: PerformanceLevel,
  trails: boolean,
): Promise<SceneSetup> {
  const workerSetup = await requestSceneSetup();
  return sceneFileV1Schema.shape.payload.parse({ ...workerSetup, performanceLevel, trails });
}

export function applyPresetPlan(
  mode: "single" | "collision" | "builder",
  scene: SceneSetup,
  preset: DraftGalaxy,
  viewportCenter: Vec2,
  newId: string,
) {
  if (mode === "single") {
    const current = scene.galaxies[0];
    if (!current) throw new Error("Single mode requires a galaxy.");
    return {
      command: {
        type: "PATCH_GALAXY" as const,
        payload: { galaxyId: current.id, generation: preset.generation, name: preset.name },
      },
      selectedId: current.id,
      automaticFraming: true,
    };
  }
  return {
    command: {
      type: "ADD_GALAXY" as const,
      payload: {
        galaxy: {
          id: newId,
          generation: { ...preset.generation },
          name: preset.name,
          position: { ...viewportCenter },
          bulkVelocity: { x: 0, y: 0 },
        },
      },
    },
    selectedId: newId,
    automaticFraming: false,
  };
}
