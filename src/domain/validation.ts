import type { z } from "zod";
import {
  draftGalaxySchema,
  engineSetupSchema,
  galaxyGenerationConfigSchema,
  galaxyRecordSchema,
  presetFileV1Schema,
  sceneFileV1Schema,
  sceneSetupSchema,
} from "./schemas";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validated<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): Readonly<z.output<TSchema>> {
  return deepFreeze(schema.parse(value));
}

export const validateGalaxyGenerationConfig = (value: unknown) =>
  validated(galaxyGenerationConfigSchema, value);
export const validateGalaxyRecord = (value: unknown) => validated(galaxyRecordSchema, value);
export const validateDraftGalaxy = (value: unknown) => validated(draftGalaxySchema, value);
export const validateEngineSetup = (value: unknown) => validated(engineSetupSchema, value);
export const validateSceneSetup = (value: unknown) => validated(sceneSetupSchema, value);
export const validatePresetFileV1 = (value: unknown) => validated(presetFileV1Schema, value);
export const validateSceneFileV1 = (value: unknown) => validated(sceneFileV1Schema, value);
