import { describe, expect, it } from "vitest";

import { DEFAULT_GENERATION, FIRST_LIGHT } from "../../src/domain/defaults";
import type { EngineSetup, GalaxyRecord } from "../../src/domain/types";
import { Engine } from "../../src/simulation/engine";

function galaxy(index: number, starCount = 500): GalaxyRecord {
  return {
    id: `g-${String(index)}`,
    generation: { ...DEFAULT_GENERATION, seed: index + 1, starCount },
    name: `Galaxy ${String(index)}`,
    position: { x: index * 20, y: -index * 3 },
    bulkVelocity: { x: index * 0.1, y: 0 },
  };
}

function setup(galaxies: GalaxyRecord[]): EngineSetup {
  return { galaxies, gravity: 1, playbackSpeed: 1 };
}

describe("authoritative Engine state and topology", () => {
  it("appends only the new galaxy and preserves existing live star bytes", () => {
    const engine = new Engine(setup([galaxy(0)]), true);
    engine.step(0);
    const evolvedX = engine.currentBank.starX.slice(),
      evolvedVx = engine.currentBank.starVx.slice();
    engine.addGalaxy({ ...galaxy(1), position: { x: 100, y: 0 } });
    expect(engine.currentBank.starX.slice(0, evolvedX.length)).toEqual(evolvedX);
    expect(engine.currentBank.starVx.slice(0, evolvedVx.length)).toEqual(evolvedVx);
    expect(engine.galaxyCount).toBe(2);
    expect(engine.starCount).toBe(1000);
  });
  it("initializes empty, one-galaxy, and twelve-galaxy scenes", () => {
    const empty = new Engine(setup([]), true);
    expect(empty.galaxyCount).toBe(0);
    expect(empty.starCount).toBe(0);
    const one = new Engine(
      setup([{ ...FIRST_LIGHT, generation: { ...FIRST_LIGHT.generation, starCount: 500 } }]),
      true,
    );
    expect(one.galaxyCount).toBe(1);
    expect(one.starCount).toBe(500);
    expect(one.topology.segments).toHaveLength(1);
    const twelve = new Engine(
      setup(Array.from({ length: 12 }, (_, index) => galaxy(index))),
      false,
    );
    expect(twelve.galaxyCount).toBe(12);
    expect(twelve.starCount).toBe(6_000);
    expect(Array.from(twelve.topology.ownerSlot.slice(0, 500))).toEqual(Array(500).fill(0));
    expect(Array.from(twelve.topology.ownerSlot.slice(-500))).toEqual(Array(500).fill(11));
  });

  it("builds the 120000-star boundary with exact world translation", () => {
    const record = galaxy(1, 120_000);
    record.position = { x: 125, y: -75 };
    record.bulkVelocity = { x: 1.5, y: -0.5 };
    const engine = new Engine(setup([record]), true);
    expect(engine.currentBank.starX).toHaveLength(120_000);
    expect(engine.currentBank.starY).toHaveLength(120_000);
    expect(engine.currentBank.coreX[0]).toBe(125);
    expect(engine.currentBank.coreVy[0]).toBe(-0.5);
    expect(Array.from(engine.currentBank.starX).every(Number.isFinite)).toBe(true);
  });

  it("adds, deletes, moves, and changes bulk velocity while rebuilding ownership", () => {
    const engine = new Engine(setup([galaxy(0)]), true);
    engine.addGalaxy(galaxy(1));
    expect(engine.topology.descriptors.map((descriptor) => descriptor.id)).toEqual(["g-0", "g-1"]);
    engine.moveGalaxy("g-1", 90, -45);
    engine.setBulkVelocity("g-1", 2, -1);
    expect(engine.sceneSetup().galaxies[1]).toMatchObject({
      position: { x: 90, y: -45 },
      bulkVelocity: { x: 2, y: -1 },
    });
    engine.deleteGalaxy("g-0");
    expect(engine.topology.descriptors.map((descriptor) => descriptor.id)).toEqual(["g-1"]);
    expect(Array.from(engine.topology.ownerSlot).every((slot) => slot === 0)).toBe(true);
  });

  it("refreshes a name without changing any live star bytes", () => {
    const engine = new Engine(setup([galaxy(0)]), true);
    const before = {
      x: engine.currentBank.starX.slice(),
      y: engine.currentBank.starY.slice(),
      vx: engine.currentBank.starVx.slice(),
      vy: engine.currentBank.starVy.slice(),
    };
    expect(engine.patchGalaxy("g-0", { ...DEFAULT_GENERATION, starCount: 500 }, "Renamed")).toBe(
      "CHANGED",
    );
    expect(engine.currentBank.starX).toEqual(before.x);
    expect(engine.currentBank.starY).toEqual(before.y);
    expect(engine.currentBank.starVx).toEqual(before.vx);
    expect(engine.currentBank.starVy).toEqual(before.vy);
    expect(engine.topology.descriptors[0]?.name).toBe("Renamed");
  });

  it("regenerates with exact live core state, identity, globals, and playing state", () => {
    const engine = new Engine(setup([galaxy(0)]), true);
    engine.moveGalaxy("g-0", 12.25, -7.5);
    engine.setBulkVelocity("g-0", 1.25, -0.75);
    engine.gravity = 2;
    engine.playbackSpeed = 4;
    const before = engine.currentBank.starX.slice();
    const changed = { ...DEFAULT_GENERATION, seed: 999, starCount: 500 };
    engine.patchGalaxy("g-0", changed, "Galaxy 0");
    expect(engine.sceneSetup()).toMatchObject({
      gravity: 2,
      playbackSpeed: 4,
      galaxies: [
        {
          id: "g-0",
          generation: changed,
          position: { x: 12.25, y: -7.5 },
          bulkVelocity: { x: 1.25, y: -0.75 },
        },
      ],
    });
    expect(engine.playing).toBe(true);
    expect(engine.currentBank.starX).not.toEqual(before);
    const once = engine.currentBank.starX.slice();
    expect(engine.regenerateScene()).toBe("CHANGED");
    expect(engine.currentBank.starX).toEqual(once);
  });

  it("restores complete exact snapshots and forces playback paused", async () => {
    const engine = new Engine(setup([galaxy(0), galaxy(1)]), true);
    const before = await engine.stateDigest();
    const snapshot = engine.requestSnapshot();
    engine.moveGalaxy("g-0", 500, 200);
    engine.gravity = 3;
    expect(await engine.stateDigest()).not.toBe(before);
    engine.restoreSnapshot(snapshot);
    expect(await engine.stateDigest()).toBe(before);
    expect(engine.playing).toBe(false);
    expect(engine.releaseSnapshot(snapshot)).toBe(true);
    expect(() => {
      engine.restoreSnapshot(snapshot);
    }).toThrow("SNAPSHOT_NOT_FOUND");
  });

  it("rejects invalid public mutations and transport state without changing the scene", () => {
    const engine = new Engine(setup([galaxy(0)]), false);
    const generation = { ...DEFAULT_GENERATION, starCount: 500 };
    expect(engine.patchGalaxy("g-0", generation, "Galaxy 0")).toBe("NO_CHANGE");
    expect(() => engine.patchGalaxy("missing", generation, null)).toThrow("GALAXY_NOT_FOUND");
    expect(() => {
      engine.deleteGalaxy("missing");
    }).toThrow("GALAXY_NOT_FOUND");
    expect(() => {
      engine.moveGalaxy("missing", 0, 0);
    }).toThrow("GALAXY_NOT_FOUND");
    expect(() => {
      engine.setBulkVelocity("missing", 0, 0);
    }).toThrow("GALAXY_NOT_FOUND");
    expect(() => engine.requestedPeakLinearY("missing")).toThrow("GALAXY_NOT_FOUND");
    expect(() => engine.writeFrame(new ArrayBuffer(0))).toThrow("FRAME_TRANSPORT");
    expect(engine.releaseSnapshot("missing")).toBe(false);

    const checkpoint = engine.createCheckpoint();
    expect(() => {
      engine.restoreCheckpoint({
        ...checkpoint,
        topology: { ...checkpoint.topology, ownerSlot: new Uint8Array(0) },
      });
    }).toThrow("INVALID_SIMULATION_STATE");
    expect(() => {
      engine.restoreCheckpoint({
        ...checkpoint,
        bank: { ...checkpoint.bank, starX: [] as never },
      });
    }).toThrow("INVALID_SIMULATION_STATE");
    expect(engine.sceneSetup().galaxies.map(({ id }) => id)).toEqual(["g-0"]);
  });

  it("treats regeneration of an empty scene as an exact no-op", () => {
    const engine = new Engine(setup([]), true);
    expect(engine.regenerateScene()).toBe("NO_CHANGE");
    expect(engine.consumeMergerMappings()).toEqual([]);
  });

  it("detects missing immutable style blocks on every rebuild and digest path", async () => {
    const deletion = new Engine(setup([galaxy(0), galaxy(1)]), false);
    (deletion.topology.styleBlocks as Map<string, unknown>).clear();
    expect(() => {
      deletion.deleteGalaxy("g-0");
    }).toThrow("INVALID_SIMULATION_STATE");

    const regeneration = new Engine(setup([galaxy(0), galaxy(1)]), false);
    (regeneration.topology.styleBlocks as Map<string, unknown>).clear();
    expect(() =>
      regeneration.patchGalaxy(
        "g-0",
        { ...DEFAULT_GENERATION, seed: 99, starCount: 500 },
        "Galaxy 0",
      ),
    ).toThrow("INVALID_SIMULATION_STATE");

    const digest = new Engine(setup([{ ...galaxy(0), name: null }]), false);
    (digest.topology.styleBlocks as Map<string, unknown>).clear();
    await expect(digest.stateDigest()).rejects.toThrow("INVALID_SIMULATION_STATE");

    const ownership = new Engine(setup([galaxy(0)]), false);
    (ownership.topology as { ownerSlot: Uint8Array }).ownerSlot = new Uint8Array(0);
    expect(() => {
      ownership.moveGalaxy("g-0", 1, 1);
    }).toThrow("INVALID_SIMULATION_STATE");
  });
});
