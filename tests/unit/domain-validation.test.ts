import { describe, expect, it } from "vitest";
import { DEFAULT_GENERATION, DEFAULT_SCENE_SETUP } from "../../src/domain/defaults";
import { coreRadius, sceneTotals } from "../../src/domain/derived";
import { normalizedName, validateProductName } from "../../src/domain/names";
import {
  MAX_GALAXIES,
  MAX_SCENE_MASS,
  MAX_SCENE_STARS,
  PERFORMANCE_STAR_BUDGETS,
  UINT32_MAX,
} from "../../src/domain/ranges";
import {
  draftGalaxySchema,
  engineSetupSchema,
  galaxyGenerationConfigSchema,
  galaxyRecordSchema,
  presetFileV1Schema,
  sceneFileV1Schema,
  sceneSetupSchema,
} from "../../src/domain/schemas";
import {
  validateGalaxyGenerationConfig,
  validateGalaxyRecord,
  validateSceneSetup,
} from "../../src/domain/validation";

const generation = (changes: Record<string, unknown> = {}) => ({
  ...DEFAULT_GENERATION,
  ...changes,
});

const galaxy = (id = "g-1", generationChanges: Record<string, unknown> = {}) => ({
  id,
  generation: generation(generationChanges),
  name: " Example ",
  position: { x: 0, y: 0 },
  bulkVelocity: { x: 0, y: 0 },
});

const scene = (galaxies = [galaxy()]) => ({
  galaxies,
  gravity: 1,
  playbackSpeed: 1,
  performanceLevel: "balanced",
  trails: false,
});

describe("domain constants and validation", () => {
  it("publishes the exact defaults and derived constants", () => {
    expect(DEFAULT_GENERATION).toEqual({
      type: "spiral",
      seed: 1,
      starCount: 30_000,
      size: 40,
      mass: 25,
      spin: 1,
      armCount: 2,
      blackHole: false,
    });
    expect(PERFORMANCE_STAR_BUDGETS).toEqual({ low: 10_000, balanced: 30_000, high: 60_000 });
    expect(coreRadius(10)).toBe(2);
    expect(coreRadius(40)).toBe(4);
    expect(coreRadius(100)).toBe(10);
    expect(sceneTotals(DEFAULT_SCENE_SETUP.galaxies)).toEqual({ starCount: 30_000, mass: 25 });
  });

  it("accepts every numeric minimum, default, and maximum", () => {
    expect(
      galaxyGenerationConfigSchema.parse(
        generation({ seed: 0, starCount: 500, size: 10, mass: 1, spin: -2, armCount: 1 }),
      ),
    ).toBeDefined();
    expect(galaxyGenerationConfigSchema.parse(generation())).toBeDefined();
    expect(
      galaxyGenerationConfigSchema.parse(
        generation({
          type: "barredSpiral",
          seed: UINT32_MAX,
          starCount: 120_000,
          size: 100,
          mass: 1_200,
          spin: 2,
          armCount: 8,
        }),
      ),
    ).toBeDefined();
    expect(
      galaxyRecordSchema.parse({
        ...galaxy(),
        position: { x: -10_000, y: 10_000 },
        bulkVelocity: { x: 12, y: 16 },
      }),
    ).toBeDefined();
    expect(
      sceneSetupSchema.parse({ ...scene(), gravity: 0.25, playbackSpeed: 0.25 }),
    ).toBeDefined();
    expect(sceneSetupSchema.parse({ ...scene(), gravity: 4, playbackSpeed: 4 })).toBeDefined();
  });

  it.each([
    ["seed below", { seed: -1 }],
    ["seed above", { seed: UINT32_MAX + 1 }],
    ["seed fractional", { seed: 1.5 }],
    ["stars below", { starCount: 499 }],
    ["stars above", { starCount: 120_001 }],
    ["stars fractional", { starCount: 500.5 }],
    ["size below", { size: 9.999 }],
    ["size above", { size: 100.001 }],
    ["mass below", { mass: 0.999 }],
    ["mass above", { mass: 1_200.001 }],
    ["spin below", { spin: -2.001 }],
    ["spin above", { spin: 2.001 }],
    ["arms below", { armCount: 0 }],
    ["arms above", { armCount: 9 }],
    ["arms fractional", { armCount: 2.5 }],
  ])("rejects the just-outside generation value: %s", (_name, changes) => {
    expect(() => galaxyGenerationConfigSchema.parse(generation(changes))).toThrow();
  });

  it("rejects every invalid numeric primitive and non-finite number", () => {
    for (const value of [undefined, null, "1", true, {}, [], Number.NaN, Infinity, -Infinity]) {
      expect(() => galaxyGenerationConfigSchema.parse(generation({ size: value }))).toThrow();
    }
    expect(() =>
      galaxyRecordSchema.parse({ ...galaxy(), position: { x: Infinity, y: 0 } }),
    ).toThrow();
    expect(() => sceneSetupSchema.parse({ ...scene(), gravity: Number.NaN })).toThrow();
  });

  it("enforces arm applicability without silently canonicalizing invalid input", () => {
    for (const type of ["spiral", "barredSpiral"]) {
      expect(() =>
        galaxyGenerationConfigSchema.parse(generation({ type, armCount: null })),
      ).toThrow();
    }
    for (const type of ["elliptical", "irregular", "dwarf"]) {
      expect(
        galaxyGenerationConfigSchema.parse(generation({ type, armCount: null })).armCount,
      ).toBeNull();
      expect(() => galaxyGenerationConfigSchema.parse(generation({ type, armCount: 2 }))).toThrow();
    }
  });

  it("canonicalizes negative zero in a cloned immutable value without mutating input", () => {
    const input = {
      ...galaxy(),
      generation: generation({ spin: -0 }),
      name: "  Kept text  ",
      position: { x: -0, y: -0 },
      bulkVelocity: { x: -0, y: -0 },
    };
    const result = validateGalaxyRecord(input);
    expect(Object.is(result.generation.spin, -0)).toBe(false);
    expect(Object.is(result.position.x, -0)).toBe(false);
    expect(Object.is(result.bulkVelocity.y, -0)).toBe(false);
    expect(result.name).toBe("Kept text");
    expect(Object.is(input.generation.spin, -0)).toBe(true);
    expect(input.name).toBe("  Kept text  ");
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.generation)).toBe(true);
  });

  it("enforces identifiers, position, velocity, strict fields, and exact primitives", () => {
    expect(() => galaxyRecordSchema.parse({ ...galaxy("bad id") })).toThrow();
    expect(() => galaxyRecordSchema.parse({ ...galaxy("é") })).toThrow();
    expect(() => galaxyRecordSchema.parse({ ...galaxy("a".repeat(101)) })).toThrow();
    expect(() =>
      galaxyRecordSchema.parse({ ...galaxy(), position: { x: -10_001, y: 0 } }),
    ).toThrow();
    expect(() =>
      galaxyRecordSchema.parse({ ...galaxy(), position: { x: 0, y: 10_001 } }),
    ).toThrow();
    expect(() =>
      galaxyRecordSchema.parse({ ...galaxy(), bulkVelocity: { x: 20, y: 0.001 } }),
    ).toThrow();
    expect(() => galaxyRecordSchema.parse({ ...galaxy(), extra: true })).toThrow();
    expect(() => draftGalaxySchema.parse({ generation: generation(), name: undefined })).toThrow();
  });

  it("rejects duplicate IDs and every scene aggregate overflow", () => {
    expect(() => sceneSetupSchema.parse(scene([galaxy("same"), galaxy("same")]))).toThrow();
    const maximum = Array.from({ length: MAX_GALAXIES }, (_, index) =>
      galaxy(`g-${String(index)}`, { starCount: 10_000, mass: 100 }),
    );
    expect(sceneSetupSchema.parse(scene(maximum)).galaxies).toHaveLength(12);
    expect(sceneTotals(sceneSetupSchema.parse(scene(maximum)).galaxies)).toEqual({
      starCount: MAX_SCENE_STARS,
      mass: MAX_SCENE_MASS,
    });
    expect(() =>
      sceneSetupSchema.parse(scene([...maximum, galaxy("g-13", { starCount: 500, mass: 1 })])),
    ).toThrow();
    expect(() =>
      sceneSetupSchema.parse(
        scene([galaxy("a", { starCount: 60_001 }), galaxy("b", { starCount: 60_000 })]),
      ),
    ).toThrow();
    expect(() =>
      sceneSetupSchema.parse(scene([galaxy("a", { mass: 600.001 }), galaxy("b", { mass: 600 })])),
    ).toThrow();
  });

  it("handles Unicode names by trimmed code points and separate NFC uniqueness keys", () => {
    const astral80 = "🌌".repeat(80);
    const combining80 = "e\u0301".repeat(40);
    expect(validateProductName(`  ${astral80}  `)).toBe(astral80);
    expect(validateProductName(combining80)).toBe(combining80);
    expect(normalizedName("  E\u0301  ")).toBe(normalizedName("é"));
    expect(() => validateProductName("🌌".repeat(81))).toThrow();
    expect(() => validateProductName("e\u0301".repeat(41))).toThrow();
    expect(() => validateProductName("   ")).toThrow();
    expect(() => validateProductName(7)).toThrow(TypeError);
  });

  it("validates strict Engine, Scene, preset, and scene-file records", () => {
    const engine = { galaxies: [galaxy()], gravity: 1, playbackSpeed: 1 };
    expect(engineSetupSchema.parse(engine)).toBeDefined();
    expect(() => engineSetupSchema.parse({ ...engine, trails: false })).toThrow();
    const metadata = {
      schemaVersion: 1,
      generationVersion: 1,
      appVersion: "0.1.0",
      id: "portable-1",
      name: "Portable",
      exportedAt: "2026-07-15T22:00:00.000Z",
    };
    expect(
      presetFileV1Schema.parse({
        kind: "galaxia-preset",
        ...metadata,
        payload: { generation: generation(), name: null },
      }),
    ).toBeDefined();
    expect(
      sceneFileV1Schema.parse({ kind: "galaxia-scene", ...metadata, payload: scene() }),
    ).toBeDefined();
    expect(() =>
      sceneFileV1Schema.parse({ kind: "galaxia-scene", ...metadata, payload: scene(), unknown: 1 }),
    ).toThrow();
    expect(() =>
      sceneFileV1Schema.parse({
        kind: "galaxia-scene",
        ...metadata,
        schemaVersion: 2,
        payload: scene(),
      }),
    ).toThrow();
  });

  it("returns a new immutable scene while preserving the input graph", () => {
    const input = scene();
    const before = structuredClone(input);
    const result = validateSceneSetup(input);
    expect(input).toEqual(before);
    expect(result).not.toBe(input);
    expect(result.galaxies[0]).not.toBe(input.galaxies[0]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.galaxies)).toBe(true);
    expect(validateGalaxyGenerationConfig(generation())).toEqual(DEFAULT_GENERATION);
  });
});
