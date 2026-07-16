import { beforeAll, describe, expect, it } from "vitest";

import { bootstrapDeterministicArtifacts } from "../../src/app/bootstrap";
import type { GalaxyGenerationConfig, GalaxyType } from "../../src/domain/types";
import { canonicalGenerationDigest } from "../../src/generation/canonicalDigest";
import { generateGalaxy } from "../../src/generation/generateGalaxy";
import expected from "../fixtures/generation-digests.json";

const types: readonly GalaxyType[] = ["spiral", "barredSpiral", "elliptical", "irregular", "dwarf"];

function fixture(type: GalaxyType, starCount: number): GalaxyGenerationConfig {
  return {
    type,
    seed: 0x10203040 + types.indexOf(type),
    starCount,
    size: starCount === 500 ? 100 : 40,
    mass: 25,
    spin: type === "irregular" ? 0.4 : type === "elliptical" ? 0.6 : 1,
    armCount: type === "spiral" || type === "barredSpiral" ? 3 : null,
    blackHole: false,
  };
}

beforeAll(async () => {
  await bootstrapDeterministicArtifacts();
});

describe("browser generation determinism pack", () => {
  it("matches every normalized fixed-fixture digest", async () => {
    const fixtures = [];
    for (const type of types) {
      for (const starCount of [500, 120_000]) {
        const id = `${type}-${String(starCount)}`;
        const digest = await canonicalGenerationDigest(generateGalaxy(fixture(type, starCount)));
        fixtures.push({ id, digest });
      }
    }
    fixtures.sort((left, right) => left.id.localeCompare(right.id));
    expect({ fixtures }).toEqual(expected);
  }, 60_000);
});
