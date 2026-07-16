/* eslint-disable @typescript-eslint/no-non-null-assertion -- Fixed modulo and loop bounds prove these slots exist. */
import { BASE_G } from "../domain/physicsContract";
import { PERFORMANCE_STAR_BUDGETS } from "../domain/ranges";
import type {
  EngineSetup,
  GalaxyGenerationConfig,
  GalaxyRecord,
  GalaxyType,
  PerformanceLevel,
  RandomCategory,
} from "../domain/types";
import {
  GALAXY_TYPE_CODES,
  hashWords,
  HASH_DOMAINS,
  PERFORMANCE_CODES,
  RANDOM_CATEGORY_CODES,
} from "./hashWords";
import { Mulberry32 } from "./mulberry32";
import { cosTurn, sinTurn } from "./sineTable";

const TYPES = Object.freeze(
  Object.entries(GALAXY_TYPE_CODES)
    .sort((left, right) => left[1] - right[1])
    .map(([type]) => type as GalaxyType),
);

function allocateCounts(category: RandomCategory, budget: number, count: number) {
  if (category === "single") return [budget];
  if (category === "collision") return [Math.floor(budget / 2), budget - Math.floor(budget / 2)];
  const base = Math.floor(budget / count);
  const remainder = budget - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function deterministicId(rootSeed: number, index: number, used: Set<string>) {
  for (let collision = 0; collision < 100; collision += 1) {
    const words = collision === 0 ? [rootSeed, index] : [rootSeed, index, collision];
    const hex = hashWords(HASH_DOMAINS.randomId, words).toString(16).padStart(8, "0");
    const id = `r-${hex}-${String(index)}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error("INVALID_SIMULATION_STATE: deterministic Random ID collision limit reached.");
}

function childGeneration(rootSeed: number, index: number, starCount: number) {
  const child = new Mulberry32(hashWords(HASH_DOMAINS.randomChild, [rootSeed, index]));
  const type = TYPES[child.nextUint32() % 5]!;
  const seed = child.nextUint32();
  const size = Math.fround(28 + 24 * child.nextFloat());
  const mass = Math.fround(18 + 24 * child.nextFloat());
  const magnitude = Math.fround(0.55 + 0.9 * child.nextFloat());
  const spin = Math.fround(child.nextUint32() % 2 === 1 ? -magnitude : magnitude);
  const armCount =
    type === "spiral" || type === "barredSpiral" ? 2 + (child.nextUint32() % 3) : null;
  const blackHole = child.nextFloat() < 0.2;
  return {
    type,
    seed,
    starCount,
    size,
    mass,
    spin,
    armCount,
    blackHole,
  } satisfies GalaxyGenerationConfig;
}

function subtractMassWeightedMeans(galaxies: GalaxyRecord[], includePosition: boolean) {
  let totalMass = 0;
  let positionX = 0;
  let positionY = 0;
  let velocityX = 0;
  let velocityY = 0;
  for (const galaxy of galaxies) {
    const mass = galaxy.generation.mass;
    totalMass += mass;
    positionX += mass * galaxy.position.x;
    positionY += mass * galaxy.position.y;
    velocityX += mass * galaxy.bulkVelocity.x;
    velocityY += mass * galaxy.bulkVelocity.y;
  }
  const meanX = positionX / totalMass;
  const meanY = positionY / totalMass;
  const meanVx = velocityX / totalMass;
  const meanVy = velocityY / totalMass;
  for (const galaxy of galaxies) {
    if (includePosition) {
      galaxy.position.x = Math.fround(galaxy.position.x - meanX);
      galaxy.position.y = Math.fround(galaxy.position.y - meanY);
    }
    galaxy.bulkVelocity.x = Math.fround(galaxy.bulkVelocity.x - meanVx);
    galaxy.bulkVelocity.y = Math.fround(galaxy.bulkVelocity.y - meanVy);
  }
}

export function generateRandomScenario(
  category: RandomCategory,
  scenarioSeed: number,
  performanceLevel: PerformanceLevel,
): EngineSetup {
  const rootSeed = hashWords(HASH_DOMAINS.randomScenario, [
    RANDOM_CATEGORY_CODES[category],
    scenarioSeed,
    PERFORMANCE_CODES[performanceLevel],
  ]);
  const root = new Mulberry32(rootSeed);
  const count =
    category === "single" ? 1 : category === "collision" ? 2 : 3 + (root.nextUint32() % 3);
  const phase = category === "cluster" ? root.nextFloat() : 0;
  const counts = allocateCounts(category, PERFORMANCE_STAR_BUDGETS[performanceLevel], count);
  const usedIds = new Set<string>();
  const galaxies: GalaxyRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    const starCount = counts[index]!;
    galaxies.push({
      id: deterministicId(rootSeed, index, usedIds),
      generation: childGeneration(rootSeed, index, starCount),
      name: `Random Galaxy ${String(index + 1)}`,
      position: { x: 0, y: 0 },
      bulkVelocity: { x: 0, y: 0 },
    });
  }
  if (category === "collision") {
    const first = galaxies[0]!;
    const second = galaxies[1]!;
    first.position = { x: Math.fround(-30), y: Math.fround(0) };
    first.bulkVelocity = { x: Math.fround(0.25), y: Math.fround(0.35) };
    second.position = { x: Math.fround(30), y: Math.fround(0) };
    second.bulkVelocity = { x: Math.fround(-0.25), y: Math.fround(-0.35) };
    subtractMassWeightedMeans(galaxies, false);
  } else if (category === "cluster") {
    let totalMass = 0;
    for (const galaxy of galaxies) totalMass += galaxy.generation.mass;
    const radius = 100;
    const baseSpeed = Math.min(8, 0.55 * Math.sqrt((BASE_G * totalMass) / radius));
    for (let index = 0; index < galaxies.length; index += 1) {
      const galaxy = galaxies[index]!;
      const turns = phase + index / galaxies.length;
      const radialX = cosTurn(turns);
      const radialY = sinTurn(turns);
      const perturbation = index % 2 === 0 ? 0.15 : -0.15;
      galaxy.position = {
        x: Math.fround(radius * radialX),
        y: Math.fround(radius * radialY),
      };
      galaxy.bulkVelocity = {
        x: Math.fround(-radialY * baseSpeed + radialX * perturbation),
        y: Math.fround(radialX * baseSpeed + radialY * perturbation),
      };
    }
    subtractMassWeightedMeans(galaxies, true);
  }
  return { galaxies, gravity: 1, playbackSpeed: 1 };
}
