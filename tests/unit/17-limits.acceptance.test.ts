import { expect, it } from "vitest";
import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import { galaxyGenerationConfigSchema, sceneSetupSchema } from "../../src/domain/schemas";

it("scenario 17 accepts exact product bounds and rejects adjacent values", () => {
  expect(
    galaxyGenerationConfigSchema.parse({
      ...DEFAULT_GENERATION,
      seed: 0xffff_ffff,
      starCount: 120_000,
      size: 100,
      mass: 1_200,
      spin: 2,
      armCount: 8,
    }),
  ).toBeDefined();
  expect(() =>
    galaxyGenerationConfigSchema.parse({ ...DEFAULT_GENERATION, starCount: 120_001 }),
  ).toThrow();
  expect(() =>
    sceneSetupSchema.parse({ galaxies: [], gravity: 4.001, playbackSpeed: 1 }),
  ).toThrow();
});
