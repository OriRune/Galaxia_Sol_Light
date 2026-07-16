import { describe, expect, it } from "vitest";

import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import type { EngineSetup, GalaxyRecord, PlaybackSpeed } from "../../src/domain/types";
import { Engine } from "../../src/simulation/engine";
import {
  accumulateCoreAccelerations,
  applyOverlapFrictionHalfImpulse,
  createFrictionWorkspace,
} from "../../src/simulation/corePhysics";
import { SimulationScheduler, type ScheduledEngine } from "../../src/simulation/scheduler";
import { writeStarAcceleration } from "../../src/simulation/starPhysics";

function core(
  id: string,
  seed: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
): GalaxyRecord {
  return {
    id,
    generation: { ...DEFAULT_GENERATION, seed, starCount: 500 },
    name: null,
    position: { x, y },
    bulkVelocity: { x: vx, y: vy },
  };
}

function engineSetup(galaxies: GalaxyRecord[]): EngineSetup {
  return { galaxies, gravity: 1, playbackSpeed: 1 };
}

class CountingEngine implements ScheduledEngine {
  playing = true;
  playbackSpeed: PlaybackSpeed = 1;
  stepAccumulator = 0;
  steps = 0;
  activeWallSeconds = 0;
  step(activeWallSeconds: number) {
    this.steps += 1;
    this.activeWallSeconds += activeWallSeconds;
    return true;
  }
}

describe("production core physics", () => {
  it("rejects inconsistent topology workspaces at physics boundaries", () => {
    const engine = new Engine(engineSetup([core("a", 1, 0, 0, 0, 0)]), true);
    expect(() => {
      accumulateCoreAccelerations(
        engine.currentBank,
        [engine.topology.descriptors[0], undefined] as never,
        1,
      );
    }).toThrow("INVALID_SIMULATION_STATE");
    expect(() => {
      applyOverlapFrictionHalfImpulse(
        engine.currentBank,
        engine.topology,
        createFrictionWorkspace(0),
      );
    }).toThrow("INVALID_SIMULATION_STATE");
    const two = new Engine(engineSetup([core("a", 1, 0, 0, 0, 0), core("b", 2, 0, 0, 0, 0)]), true);
    const descriptors = [two.topology.descriptors[0], undefined] as never;
    expect(() => {
      applyOverlapFrictionHalfImpulse(
        two.currentBank,
        { ...two.topology, descriptors },
        createFrictionWorkspace(2),
      );
    }).toThrow("INVALID_SIMULATION_STATE");
  });

  it("handles coincident stars and rejects missing ownership metadata", () => {
    const engine = new Engine(
      engineSetup([core("a", 1, 0, 0, 0, 0), core("b", 2, 0, 0, 0, 0)]),
      true,
    );
    engine.currentBank.starX[0] = 0;
    engine.currentBank.starY[0] = 0;
    const output = new Float64Array(2);
    writeStarAcceleration(engine.currentBank, engine.topology, 1, 0, output);
    expect(Array.from(output).every(Number.isFinite)).toBe(true);
    expect(() => {
      writeStarAcceleration(
        engine.currentBank,
        { ...engine.topology, ownerSlot: new Uint8Array(0) },
        1,
        0,
        output,
      );
    }).toThrow("INVALID_SIMULATION_STATE");
    expect(() => {
      writeStarAcceleration(
        engine.currentBank,
        { ...engine.topology, descriptors: [] },
        1,
        0,
        output,
      );
    }).toThrow("INVALID_SIMULATION_STATE");
    const descriptors = [engine.topology.descriptors[0], undefined] as never;
    expect(() => {
      writeStarAcceleration(engine.currentBank, { ...engine.topology, descriptors }, 1, 0, output);
    }).toThrow("INVALID_SIMULATION_STATE");
  });

  it.each([3, 12])("conserves core momentum across %i overlapping cores", (count) => {
    const galaxies = Array.from({ length: count }, (_, index) => {
      const record = core(
        `c-${String(index)}`,
        index + 1,
        (index - count / 2) * 2,
        (index % 3) * 1.5,
        index * 1.1,
        0,
      );
      record.generation = {
        ...record.generation,
        mass: 10 + index,
        size: 40,
      };
      return record;
    });
    const engine = new Engine(engineSetup(galaxies), true);
    const momentum = () => {
      let x = 0;
      let y = 0;
      for (let index = 0; index < galaxies.length; index += 1) {
        const mass = galaxies[index]?.generation.mass ?? 0;
        x += mass * (engine.currentBank.coreVx[index] ?? 0);
        y += mass * (engine.currentBank.coreVy[index] ?? 0);
      }
      return { x, y };
    };
    const before = momentum();
    expect(engine.step(1 / 60)).toBe(true);
    const after = momentum();
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1e-10);
  });

  it("matches the calibrated default-attraction result through two-bank steps", () => {
    const engine = new Engine(
      engineSetup([core("a", 1, -80, 0, 0, 0), core("b", 2, 80, 0, 0, 0)]),
      true,
    );
    for (let index = 0; index < 30 * 60; index += 1) expect(engine.step(1 / 60)).toBe(true);
    const separation = Math.hypot(
      (engine.currentBank.coreX[1] ?? 0) - (engine.currentBank.coreX[0] ?? 0),
      (engine.currentBank.coreY[1] ?? 0) - (engine.currentBank.coreY[0] ?? 0),
    );
    expect(separation).toBeCloseTo(94.91200877, 6);
    expect(engine.stepIndex).toBe(1_800);
  });

  it("preserves the last valid bank when a candidate is invalid", () => {
    const engine = new Engine(
      engineSetup([core("a", 1, -20, 0, 0, 0), core("b", 2, 20, 0, 0, 0)]),
      true,
    );
    const lastReference = engine.currentBank;
    engine.gravity = Number.NaN;
    expect(engine.step(1 / 60)).toBe(false);
    expect(engine.currentBank).toBe(lastReference);
    expect(engine.playing).toBe(false);
  });
});

describe("fixed-step scheduler", () => {
  it("rejects invalid clocks, rebases reversed clocks, and reports sustained overload", async () => {
    const engine = new CountingEngine();
    const overloads: number[] = [];
    const scheduler = new SimulationScheduler(engine, { overload: () => overloads.push(1) });
    await expect(scheduler.tick(Number.NaN)).rejects.toThrow("INVALID_VALUE");
    await expect(scheduler.tick(-1)).rejects.toThrow("INVALID_VALUE");
    await scheduler.tick(10);
    expect(await scheduler.tick(5)).toBe(0);
    engine.step = () => false;
    engine.stepAccumulator = 61;
    await scheduler.tick(6);
    await scheduler.tick(5_006);
    expect(overloads).toHaveLength(1);
    expect(engine.playing).toBe(false);
  });

  it("stops draining immediately when a committed step pauses the engine", async () => {
    const engine = new CountingEngine();
    engine.step = () => {
      engine.steps += 1;
      engine.playing = false;
      return true;
    };
    const scheduler = new SimulationScheduler(engine);
    await scheduler.tick(0);
    await scheduler.tick(1_000);
    expect(engine.steps).toBe(1);
    engine.playing = true;
    engine.step = () => false;
    expect(scheduler.singleStep()).toBe(false);
  });

  it("maps each playback speed to exact steps and active wall time", async () => {
    for (const speed of [0.25, 0.5, 1, 2, 4] as const) {
      const engine = new CountingEngine();
      engine.playbackSpeed = speed;
      const scheduler = new SimulationScheduler(engine);
      await scheduler.tick(1_000);
      await scheduler.tick(2_000);
      expect(engine.steps).toBe(60 * speed);
      expect(engine.activeWallSeconds).toBeCloseTo(1, 12);
    }
  });

  it("splits exact history boundaries and yields every eight backlog steps", async () => {
    const engine = new CountingEngine();
    engine.playbackSpeed = 4;
    let markers = 0;
    let yields = 0;
    const scheduler = new SimulationScheduler(engine, {
      historyBoundary: () => {
        markers += 1;
      },
      yielded: () => {
        yields += 1;
      },
    });
    await scheduler.tick(0);
    await scheduler.tick(500);
    expect(engine.steps).toBe(120);
    expect(markers).toBe(5);
    expect(yields).toBeGreaterThanOrEqual(10);
  });

  it("does not catch up hidden, paused, or mutation-locked time", async () => {
    const engine = new CountingEngine();
    const scheduler = new SimulationScheduler(engine);
    await scheduler.tick(0);
    scheduler.setVisibility(false);
    await scheduler.tick(10_000);
    scheduler.setVisibility(true);
    await scheduler.tick(20_000);
    await scheduler.tick(21_000);
    expect(engine.steps).toBe(60);
    scheduler.setMutationLocked(true);
    await scheduler.tick(30_000);
    scheduler.setMutationLocked(false);
    await scheduler.tick(40_000);
    await scheduler.tick(41_000);
    expect(engine.steps).toBe(120);
    expect(scheduler.singleStep()).toBe(true);
    expect(engine.playing).toBe(false);
    expect(engine.activeWallSeconds).toBeCloseTo(2, 12);
  });
});
