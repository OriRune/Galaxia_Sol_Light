import { beforeAll, expect, it } from "vitest";
import { bootstrapDeterministicArtifacts } from "../../src/app/bootstrap";
import { canonicalGenerationDigest } from "../../src/generation/canonicalDigest";
import { generateGalaxy } from "../../src/generation/generateGalaxy";
import { generateRandomScenario } from "../../src/generation/randomScenarios";

beforeAll(async () => bootstrapDeterministicArtifacts());

it.each(["single", "collision", "cluster"] as const)(
  "scenario 9 reproduces %s random scenes exactly",
  async (category) => {
    const first = generateRandomScenario(category, 0x1234_5678, "low");
    const second = generateRandomScenario(category, 0x1234_5678, "low");
    expect(second).toEqual(first);
    const firstDigests = await Promise.all(
      first.galaxies.map((galaxy) => canonicalGenerationDigest(generateGalaxy(galaxy.generation))),
    );
    const secondDigests = await Promise.all(
      second.galaxies.map((galaxy) => canonicalGenerationDigest(generateGalaxy(galaxy.generation))),
    );
    expect(secondDigests).toEqual(firstDigests);
    expect(first.galaxies.reduce((sum, galaxy) => sum + galaxy.generation.starCount, 0)).toBe(
      10_000,
    );
  },
  30_000,
);
