import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { FIRST_LIGHT } from "../../src/domain/defaults";
import { PERFORMANCE_STAR_BUDGETS } from "../../src/domain/ranges";
import type { EngineSetup, PerformanceLevel, RandomCategory } from "../../src/domain/types";
import { BUILT_IN_PRESETS } from "../../src/generation/presets";
import { generateRandomScenario } from "../../src/generation/randomScenarios";

const levels: readonly PerformanceLevel[] = ["low", "balanced", "high"];
const categories: readonly RandomCategory[] = ["single", "collision", "cluster"];

function setupDigest(setup: EngineSetup) {
  return createHash("sha256").update(JSON.stringify(setup)).digest("hex");
}

function weightedMeans(setup: EngineSetup) {
  let mass = 0;
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  for (const galaxy of setup.galaxies) {
    const childMass = galaxy.generation.mass;
    mass += childMass;
    x += childMass * galaxy.position.x;
    y += childMass * galaxy.position.y;
    vx += childMass * galaxy.bulkVelocity.x;
    vy += childMass * galaxy.bulkVelocity.y;
  }
  return { x: x / mass, y: y / mass, vx: vx / mass, vy: vy / mass };
}

describe("built-in configurations", () => {
  it("defines First Light exactly", () => {
    expect(FIRST_LIGHT).toEqual({
      id: "first-light",
      name: "First Light",
      generation: {
        type: "spiral",
        seed: 1,
        starCount: 30_000,
        size: 40,
        mass: 25,
        spin: 1,
        armCount: 2,
        blackHole: false,
      },
      position: { x: 0, y: 0 },
      bulkVelocity: { x: 0, y: 0 },
    });
  });

  it("defines the five immutable presets exactly", () => {
    expect(BUILT_IN_PRESETS).toEqual([
      {
        name: "Grand Spiral",
        generation: {
          type: "spiral",
          seed: 101,
          starCount: 30_000,
          size: 40,
          mass: 25,
          spin: 1,
          armCount: 2,
          blackHole: false,
        },
      },
      {
        name: "Ember Bar",
        generation: {
          type: "barredSpiral",
          seed: 202,
          starCount: 30_000,
          size: 40,
          mass: 25,
          spin: 1,
          armCount: 2,
          blackHole: false,
        },
      },
      {
        name: "Golden Ellipse",
        generation: {
          type: "elliptical",
          seed: 303,
          starCount: 30_000,
          size: 40,
          mass: 25,
          spin: 0.6,
          armCount: null,
          blackHole: false,
        },
      },
      {
        name: "Tidepool",
        generation: {
          type: "irregular",
          seed: 404,
          starCount: 30_000,
          size: 40,
          mass: 25,
          spin: 0.4,
          armCount: null,
          blackHole: false,
        },
      },
      {
        name: "Small Wonder",
        generation: {
          type: "dwarf",
          seed: 505,
          starCount: 10_000,
          size: 25,
          mass: 8,
          spin: 0.7,
          armCount: null,
          blackHole: false,
        },
      },
    ]);
    expect(Object.isFrozen(BUILT_IN_PRESETS)).toBe(true);
    for (const preset of BUILT_IN_PRESETS) {
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.generation)).toBe(true);
    }
  });
});

describe("Random scenarios", () => {
  it.each(categories.flatMap((category) => levels.map((level) => [category, level] as const)))(
    "generates valid explicit %s output at %s level",
    (category, level) => {
      const setup = generateRandomScenario(category, 0x87654321, level);
      const expectedCount =
        category === "single" ? 1 : category === "collision" ? 2 : setup.galaxies.length;
      expect(setup.galaxies).toHaveLength(expectedCount);
      if (category === "cluster") {
        expect(setup.galaxies.length).toBeGreaterThanOrEqual(3);
        expect(setup.galaxies.length).toBeLessThanOrEqual(5);
      }
      let stars = 0;
      const ids = new Set<string>();
      for (const galaxy of setup.galaxies) {
        stars += galaxy.generation.starCount;
        expect(galaxy.generation.starCount).toBeGreaterThanOrEqual(500);
        expect(galaxy.id).toMatch(/^r-[0-9a-f]{8}-\d+$/);
        ids.add(galaxy.id);
      }
      expect(stars).toBe(PERFORMANCE_STAR_BUDGETS[level]);
      expect(ids.size).toBe(setup.galaxies.length);
      const base = Math.floor(PERFORMANCE_STAR_BUDGETS[level] / setup.galaxies.length);
      const remainder = PERFORMANCE_STAR_BUDGETS[level] % setup.galaxies.length;
      expect(setup.galaxies.map((galaxy) => galaxy.generation.starCount)).toEqual(
        setup.galaxies.map((_, index) => base + (index < remainder ? 1 : 0)),
      );
    },
  );

  it("recenters cluster barycenter and momentum and collision momentum", () => {
    const clusterMeans = weightedMeans(generateRandomScenario("cluster", 7727, "high"));
    expect(Math.abs(clusterMeans.x)).toBeLessThan(0.00001);
    expect(Math.abs(clusterMeans.y)).toBeLessThan(0.00001);
    expect(Math.abs(clusterMeans.vx)).toBeLessThan(0.00001);
    expect(Math.abs(clusterMeans.vy)).toBeLessThan(0.00001);
    const collisionMeans = weightedMeans(generateRandomScenario("collision", 7727, "high"));
    expect(Math.abs(collisionMeans.vx)).toBeLessThan(0.00001);
    expect(Math.abs(collisionMeans.vy)).toBeLessThan(0.00001);
  });

  it("has an exact reproducible setup digest and deterministic IDs", () => {
    const first = generateRandomScenario("cluster", 0x13579bdf, "balanced");
    const second = generateRandomScenario("cluster", 0x13579bdf, "balanced");
    expect(second).toEqual(first);
    expect(first.galaxies.map((galaxy) => galaxy.id)).toEqual([
      "r-ad8cccf7-0",
      "r-ac7778ed-1",
      "r-c232a870-2",
      "r-8468bcab-3",
      "r-a9cd3db3-4",
    ]);
    expect(setupDigest(first)).toBe(
      "7c57c5c5fba0f3197c9bc543990fd263962228dea0825b4f899c3f565ba6542d",
    );
  });
});
