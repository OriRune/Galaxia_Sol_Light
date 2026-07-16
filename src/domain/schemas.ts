import { z } from "zod";
import {
  MAX_ARM_COUNT,
  MAX_BULK_SPEED,
  MAX_GALAXIES,
  MAX_GRAVITY,
  MAX_ID_CODE_POINTS,
  MAX_MASS,
  MAX_NAME_CODE_POINTS,
  MAX_POSITION,
  MAX_SCENE_MASS,
  MAX_SCENE_STARS,
  MAX_SIZE,
  MAX_SPIN,
  MAX_STAR_COUNT,
  MIN_ARM_COUNT,
  MIN_GRAVITY,
  MIN_MASS,
  MIN_POSITION,
  MIN_SIZE,
  MIN_SPIN,
  MIN_STAR_COUNT,
  UINT32_MAX,
} from "./ranges";
import { GENERATION_VERSION, SCHEMA_VERSION } from "./versioning";

const canonicalFinite = z.number().transform((value) => (Object.is(value, -0) ? 0 : value));
const bounded = (minimum: number, maximum: number) =>
  canonicalFinite.pipe(z.number().min(minimum).max(maximum));
const integer = (minimum: number, maximum: number) =>
  canonicalFinite.pipe(z.number().int().min(minimum).max(maximum));

export const galaxyTypeSchema = z.enum([
  "spiral",
  "barredSpiral",
  "elliptical",
  "irregular",
  "dwarf",
]);
export const modeSchema = z.enum(["single", "collision", "builder", "random"]);
export const performanceLevelSchema = z.enum(["low", "balanced", "high"]);
export const playbackSpeedSchema = z.union([
  z.literal(0.25),
  z.literal(0.5),
  z.literal(1),
  z.literal(2),
  z.literal(4),
]);
export const randomCategorySchema = z.enum(["single", "collision", "cluster"]);

export const productNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1)
      .refine((value) => Array.from(value).length <= MAX_NAME_CODE_POINTS),
  );

export const stableIdSchema = z
  .string()
  .min(1)
  .refine((value) => Array.from(value).length <= MAX_ID_CODE_POINTS)
  .regex(/^[\x21-\x7e]+$/u, "Identifier must use non-whitespace ASCII characters.");

export const vec2Schema = z.strictObject({ x: canonicalFinite, y: canonicalFinite });
export const positionSchema = z.strictObject({
  x: bounded(MIN_POSITION, MAX_POSITION),
  y: bounded(MIN_POSITION, MAX_POSITION),
});
export const bulkVelocitySchema = vec2Schema.refine(
  (value) => Math.hypot(value.x, value.y) <= MAX_BULK_SPEED,
  "Bulk velocity magnitude exceeds 20.",
);

export const galaxyGenerationConfigSchema = z
  .strictObject({
    type: galaxyTypeSchema,
    seed: integer(0, UINT32_MAX),
    starCount: integer(MIN_STAR_COUNT, MAX_STAR_COUNT),
    size: bounded(MIN_SIZE, MAX_SIZE),
    mass: bounded(MIN_MASS, MAX_MASS),
    spin: bounded(MIN_SPIN, MAX_SPIN),
    armCount: z.union([integer(MIN_ARM_COUNT, MAX_ARM_COUNT), z.null()]),
    blackHole: z.boolean(),
  })
  .superRefine((value, context) => {
    const usesArms = value.type === "spiral" || value.type === "barredSpiral";
    if (usesArms && value.armCount === null) {
      context.addIssue({
        code: "custom",
        path: ["armCount"],
        message: "Arm type requires armCount.",
      });
    }
    if (!usesArms && value.armCount !== null) {
      context.addIssue({
        code: "custom",
        path: ["armCount"],
        message: "Non-arm type requires null armCount.",
      });
    }
  });

export const draftGalaxySchema = z.strictObject({
  generation: galaxyGenerationConfigSchema,
  name: z.union([productNameSchema, z.null()]),
});

export const galaxyRecordSchema = z.strictObject({
  id: stableIdSchema,
  generation: galaxyGenerationConfigSchema,
  name: z.union([productNameSchema, z.null()]),
  position: positionSchema,
  bulkVelocity: bulkVelocitySchema,
});

const galaxiesSchema = z
  .array(galaxyRecordSchema)
  .max(MAX_GALAXIES)
  .superRefine((galaxies, context) => {
    const ids = new Set<string>();
    let stars = 0;
    let mass = 0;
    galaxies.forEach((galaxy, index) => {
      if (ids.has(galaxy.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Galaxy IDs must be unique.",
        });
      }
      ids.add(galaxy.id);
      stars += galaxy.generation.starCount;
      mass += galaxy.generation.mass;
    });
    if (stars > MAX_SCENE_STARS) {
      context.addIssue({ code: "custom", message: "Scene star total exceeds 120000." });
    }
    if (mass > MAX_SCENE_MASS) {
      context.addIssue({ code: "custom", message: "Scene mass total exceeds 1200." });
    }
  });

export const engineSetupSchema = z.strictObject({
  galaxies: galaxiesSchema,
  gravity: bounded(MIN_GRAVITY, MAX_GRAVITY),
  playbackSpeed: playbackSpeedSchema,
});

export const sceneSetupSchema = engineSetupSchema.extend({
  performanceLevel: performanceLevelSchema,
  trails: z.boolean(),
});

const envelopeMetadata = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  generationVersion: z.literal(GENERATION_VERSION),
  appVersion: z.string().min(1),
  id: stableIdSchema,
  name: productNameSchema,
  exportedAt: z.iso.datetime({ offset: true }),
};

export const presetFileV1Schema = z.strictObject({
  kind: z.literal("galaxia-preset"),
  ...envelopeMetadata,
  payload: draftGalaxySchema,
});

export const sceneFileV1Schema = z.strictObject({
  kind: z.literal("galaxia-scene"),
  ...envelopeMetadata,
  payload: sceneSetupSchema,
});
