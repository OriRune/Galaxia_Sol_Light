import { describe, expect, it } from "vitest";

import { DEFAULT_GENERATION, FIRST_LIGHT } from "../../src/domain/defaults";
import { ownerRadialAcceleration } from "../../src/domain/physicsContract";
import type { EngineSetup, GalaxyRecord } from "../../src/domain/types";
import { accumulateCoreAccelerations } from "../../src/simulation/corePhysics";
import { Engine } from "../../src/simulation/engine";
import { writeStarAcceleration } from "../../src/simulation/starPhysics";

function setup(galaxies: GalaxyRecord[], gravity = 1): EngineSetup {
  return { galaxies, gravity, playbackSpeed: 1 };
}

function record(id: string, blackHole: boolean): GalaxyRecord {
  return {
    ...FIRST_LIGHT,
    id,
    generation: { ...DEFAULT_GENERATION, starCount: 500, blackHole },
    position: { x: 0, y: 0 },
    bulkVelocity: { x: 0, y: 0 },
  };
}

function radius90(engine: Engine, owner: number) {
  const radii: number[] = [];
  for (let star = 0; star < engine.topology.ownerSlot.length; star += 1) {
    if (engine.topology.ownerSlot[star] !== owner) continue;
    radii.push(
      Math.hypot(
        (engine.currentBank.starX[star] ?? 0) - (engine.currentBank.coreX[owner] ?? 0),
        (engine.currentBank.starY[star] ?? 0) - (engine.currentBank.coreY[owner] ?? 0),
      ),
    );
  }
  radii.sort((left, right) => left - right);
  return radii[Math.ceil(0.9 * radii.length) - 1] ?? 0;
}

describe("full star integrator", () => {
  it("matches the imported owner acceleration contract at every required radius", () => {
    for (const blackHole of [false, true]) {
      for (const gravity of [0.1, 1, 2]) {
        const galaxy = record("owner", blackHole);
        const engine = new Engine(setup([galaxy]), false);
        engine.gravity = gravity;
        const coreRadius = Math.max(2, galaxy.generation.size * 0.1);
        for (const radius of [
          0,
          0.5 * coreRadius,
          coreRadius,
          galaxy.generation.size,
          2 * galaxy.generation.size,
        ]) {
          engine.currentBank.starX[0] = radius;
          engine.currentBank.starY[0] = 0;
          accumulateCoreAccelerations(engine.currentBank, engine.topology.descriptors, gravity);
          const acceleration = new Float64Array(2);
          writeStarAcceleration(engine.currentBank, engine.topology, gravity, 0, acceleration);
          expect(acceleration[0]).toBe(
            radius === 0 ? 0 : -ownerRadialAcceleration(radius, galaxy.generation, gravity),
          );
          expect(acceleration[1]).toBe(0);
        }
      }
    }
  });

  it("keeps provisional First Light radius stable for 300 simulation units", () => {
    const engine = new Engine(setup([record("first-light", false)]), true);
    const initial = radius90(engine, 0);
    for (let step = 0; step < 300 * 60; step += 1) expect(engine.step(1 / 60)).toBe(true);
    const final = radius90(engine, 0);
    expect(final / initial).toBeGreaterThanOrEqual(0.8);
    expect(final / initial).toBeLessThanOrEqual(1.2);
    let retained = 0;
    for (let star = 0; star < engine.starCount; star += 1) {
      const radius = Math.hypot(
        (engine.currentBank.starX[star] ?? 0) - (engine.currentBank.coreX[0] ?? 0),
        (engine.currentBank.starY[star] ?? 0) - (engine.currentBank.coreY[0] ?? 0),
      );
      if (radius <= 2 * initial) retained += 1;
    }
    expect(retained / engine.starCount).toBeGreaterThanOrEqual(0.97);
  }, 30_000);

  it("produces the provisional Scenario 5 tidal-radius growth", () => {
    const first = record("a", false);
    first.position = { x: -80, y: 0 };
    first.bulkVelocity = { x: 0, y: 2 };
    first.generation = { ...first.generation, seed: 1 };
    const second = record("b", false);
    second.position = { x: 80, y: 0 };
    second.bulkVelocity = { x: 0, y: -2 };
    second.generation = { ...second.generation, seed: 2 };
    const engine = new Engine(setup([first, second]), true);
    const initial = [radius90(engine, 0), radius90(engine, 1)];
    for (let step = 0; step < 60 * 60; step += 1) expect(engine.step(1 / 60)).toBe(true);
    const growth = [radius90(engine, 0) / initial[0], radius90(engine, 1) / initial[1]];
    expect(Math.max(...growth)).toBeGreaterThanOrEqual(1.12);
  }, 30_000);

  it("reuses exactly two same-count banks across successful steps", () => {
    const engine = new Engine(setup([record("owner", true)]), true);
    const banks = new Set([engine.currentBank, engine.candidateBank]);
    for (let step = 0; step < 20; step += 1) {
      expect(engine.step(1 / 60)).toBe(true);
      expect(banks.has(engine.currentBank)).toBe(true);
      expect(banks.has(engine.candidateBank)).toBe(true);
    }
    expect(banks.size).toBe(2);
  });
});
