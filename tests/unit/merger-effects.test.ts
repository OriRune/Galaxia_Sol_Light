import { describe, expect, it } from "vitest";

import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import type { EngineSetup, GalaxyRecord } from "../../src/domain/types";
import { Engine } from "../../src/simulation/engine";
import { createRemnantRecord, eligibleMergerPairs } from "../../src/simulation/merger";

function galaxy(
  id: string,
  x: number,
  vx: number,
  overrides: Partial<GalaxyRecord["generation"]> = {},
): GalaxyRecord {
  return {
    id,
    generation: { ...DEFAULT_GENERATION, starCount: 500, ...overrides },
    name: id.toUpperCase(),
    position: { x, y: 0 },
    bulkVelocity: { x: vx, y: 0 },
  };
}

function setup(galaxies: GalaxyRecord[]): EngineSetup {
  return { galaxies, gravity: 1, playbackSpeed: 1 };
}

describe("deterministic mergers", () => {
  it("derives null, single-name, and collision-suffixed remnant identities", () => {
    const first = galaxy("a", -3, 0, { type: "elliptical", armCount: null });
    const second = galaxy("b", 3, 0);
    first.name = null;
    second.name = null;
    const engine = new Engine(setup([first, second]), false);
    const occupied = new Set<string>();
    const unnamed = createRemnantRecord(first, second, engine.currentBank, 0, 1, 4, 0, occupied);
    expect(unnamed.name).toBeNull();
    const suffixed = createRemnantRecord(
      { ...first, name: "Only" },
      second,
      engine.currentBank,
      0,
      1,
      4,
      0,
      occupied,
    );
    expect(suffixed.id).toBe(`${unnamed.id}-2`);
    expect(suffixed.name).toBe("Only Remnant");
    expect(eligibleMergerPairs([first], engine.currentBank)).toEqual([]);
    const sparse = [first, undefined] as never;
    expect(() => eligibleMergerPairs(sparse, engine.currentBank)).toThrow(
      "INVALID_SIMULATION_STATE",
    );
  });

  it("requires both the start-of-step distance and speed triggers", () => {
    const distanceOnly = new Engine(setup([galaxy("a", -3, -1), galaxy("b", 3, 1)]), true);
    expect(distanceOnly.step(1 / 60)).toBe(true);
    expect(distanceOnly.galaxyCount).toBe(2);
    const speedOnly = new Engine(setup([galaxy("a", -10, 0), galaxy("b", 10, 0)]), true);
    expect(speedOnly.step(1 / 60)).toBe(true);
    expect(speedOnly.galaxyCount).toBe(2);
  });

  it("merges both eligible inputs on that completed step with exact remnant fields", () => {
    const first = galaxy("earlier", -3, 0.2, { mass: 20, spin: 1.5, seed: 11 });
    const second = galaxy("later", 3, -0.1, {
      mass: 30,
      size: 50,
      spin: -1,
      seed: 12,
      blackHole: true,
    });
    const engine = new Engine(setup([first, second]), true);
    const styleReferences = Array.from(engine.topology.styleBlocks.values());
    expect(engine.step(1 / 60)).toBe(true);
    expect(engine.galaxyCount).toBe(1);
    const descriptor = engine.topology.descriptors[0];
    expect(descriptor).toMatchObject({
      generation: {
        type: "elliptical",
        starCount: 1_000,
        mass: 50,
        spin: 0,
        armCount: null,
        blackHole: true,
      },
      name: "EARLIER + LATER",
    });
    expect(descriptor?.id).toMatch(/^m-0-[0-9a-f]{8}-0$/);
    expect(engine.topology.segments.map((segment) => segment.ownerId)).toEqual([
      descriptor?.id,
      descriptor?.id,
    ]);
    expect(Array.from(engine.topology.styleBlocks.values())).toEqual(styleReferences);
    expect(Array.from(engine.topology.ownerSlot).every((owner) => owner === 0)).toBe(true);
    expect(engine.consumeMergerMappings()).toEqual([
      {
        inputIds: ["earlier", "later"],
        remnantId: descriptor?.id,
        oldIndices: [0, 1],
        newIndex: 0,
      },
    ]);
  });

  it("chooses the first disjoint pair and prevents same-step remnant chaining", () => {
    const engine = new Engine(
      setup([galaxy("a", -2, 0), galaxy("b", 0, 0), galaxy("c", 2, 0)]),
      true,
    );
    expect(engine.step(1 / 60)).toBe(true);
    expect(engine.galaxyCount).toBe(2);
    expect(engine.topology.descriptors[0]?.id).toBe("c");
    expect(engine.topology.descriptors[1]?.id).toMatch(/^m-/);
    expect(engine.consumeMergerMappings()[0]).toMatchObject({
      inputIds: ["a", "b"],
      oldIndices: [0, 1],
      newIndex: 1,
    });
  });

  it("applies simultaneous disjoint pairs in pair-enumeration order", () => {
    const engine = new Engine(
      setup([galaxy("a", -50, 0), galaxy("b", -45, 0), galaxy("c", 45, 0), galaxy("d", 50, 0)]),
      true,
    );
    expect(engine.step(1 / 60)).toBe(true);
    expect(engine.galaxyCount).toBe(2);
    expect(engine.consumeMergerMappings().map((mapping) => mapping.inputIds)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("encounter and merger effects", () => {
  it("creates one non-stacking encounter episode and holds a 0.55-second afterglow", () => {
    const engine = new Engine(
      setup([galaxy("a", -7, -1), galaxy("b", 7, 1), galaxy("c", 0, 3, { blackHole: true })]),
      true,
    );
    expect(engine.step(1 / 60)).toBe(true);
    expect(engine.requestedPeakLinearY("a")).toBeCloseTo(0.05 * 1.18, 15);
    expect(engine.requestedPeakLinearY("b")).toBeCloseTo(0.05 * 1.18, 15);
    expect(engine.effectState().encounterEpisodes.size).toBe(3);
    expect(engine.step(0)).toBe(true);
    engine.moveGalaxy("a", -100, 0);
    engine.moveGalaxy("b", 100, 0);
    engine.moveGalaxy("c", 0, 100);
    expect(engine.step(0)).toBe(true);
    expect(engine.effectState().encounterEpisodes.get("a")?.afterglowRemaining).toBe(0.55);
    for (let step = 0; step < 32; step += 1) expect(engine.step(1 / 60)).toBe(true);
    expect(engine.requestedPeakLinearY("a")).toBeCloseTo(0.05 * 1.18, 15);
    expect(engine.step(1 / 60)).toBe(true);
    expect(engine.step(1 / 60)).toBe(true);
    expect(engine.effectState().encounterEpisodes.has("a")).toBe(false);
    expect(engine.requestedPeakLinearY("a")).toBe(0.05);
  });

  it("freezes timers during zero-active-wall single steps", () => {
    const engine = new Engine(setup([galaxy("a", -7, -1), galaxy("b", 7, 1)]), true);
    engine.step(1 / 60);
    engine.moveGalaxy("a", -100, 0);
    engine.moveGalaxy("b", 100, 0);
    engine.step(0);
    const before = engine.effectState().encounterEpisodes.get("a")?.afterglowRemaining;
    for (let step = 0; step < 20; step += 1) engine.step(0);
    expect(engine.effectState().encounterEpisodes.get("a")?.afterglowRemaining).toBe(before);
  });

  it("holds the merger target for 1.10 active seconds from the brighter input", () => {
    const off = galaxy("a", -3, 0);
    const on = galaxy("b", 3, 0, { blackHole: true });
    const engine = new Engine(setup([off, on]), true);
    expect(engine.step(1 / 60)).toBe(true);
    const remnantId = engine.topology.descriptors[0]?.id;
    if (!remnantId) throw new Error("Expected merger remnant.");
    expect(engine.requestedPeakLinearY(remnantId)).toBeCloseTo(0.07 * 1.3, 15);
    for (let step = 0; step < 65; step += 1) expect(engine.step(1 / 60)).toBe(true);
    expect(engine.effectState().mergerEffects.has(remnantId)).toBe(true);
    for (let step = 0; step < 2; step += 1) expect(engine.step(1 / 60)).toBe(true);
    expect(engine.effectState().mergerEffects.has(remnantId)).toBe(false);
    expect(engine.requestedPeakLinearY(remnantId)).toBe(0.07);
  });

  it("restores effect state exactly through an undo snapshot", () => {
    const engine = new Engine(setup([galaxy("a", -7, -1), galaxy("b", 7, 1)]), true);
    engine.step(1 / 60);
    const snapshot = engine.requestSnapshot();
    const expected = engine.effectState();
    engine.moveGalaxy("a", -100, 0);
    engine.moveGalaxy("b", 100, 0);
    engine.step(1 / 60);
    engine.restoreSnapshot(snapshot);
    expect(engine.effectState()).toEqual(expected);
  });

  it("serializes active encounter maps through checkpoints, frames, digests, and a merger", async () => {
    const engine = new Engine(
      setup([galaxy("a", -7, -1), galaxy("b", 7, 1), galaxy("c", 0, 3)]),
      true,
    );
    engine.step(1 / 60);
    const checkpoint = engine.createCheckpoint();
    engine.restoreCheckpoint(checkpoint);
    expect(await engine.stateDigest()).toMatch(/^[0-9a-f]{64}$/);
    expect(engine.writeFrame(new ArrayBuffer(engine.starCount * 8)).bounds).toHaveLength(3);
    engine.moveGalaxy("a", -3, 0);
    engine.moveGalaxy("b", 3, 0);
    engine.setBulkVelocity("a", 0, 0);
    engine.setBulkVelocity("b", 0, 0);
    expect(engine.step(1 / 60)).toBe(true);
    expect(engine.consumeMergerMappings()).toHaveLength(1);
  });
});
