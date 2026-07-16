import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_SETUP, FIRST_LIGHT } from "../../src/domain/defaults";
import { Engine } from "../../src/simulation/engine";
describe("production snapshots and accounting", () => {
  it("accounts mutable banks exactly and shared styles once", () => {
    const setup = {
        ...DEFAULT_ENGINE_SETUP,
        galaxies: [{ ...FIRST_LIGHT, generation: { ...FIRST_LIGHT.generation, starCount: 500 } }],
      },
      engine = new Engine(setup, true),
      first = engine.requestSnapshot(),
      second = engine.requestSnapshot(),
      bytes = engine.snapshotByteAccounting();
    expect(bytes).toEqual({
      snapshotCount: 2,
      mutableBytes: 2 * (500 * 16 + 48),
      sharedStyleBytes: 500 * 5,
      totalBytes: 2 * (500 * 16 + 48) + 500 * 5,
    });
    engine.releaseSnapshot(first);
    expect(engine.snapshotByteAccounting().mutableBytes).toBe(500 * 16 + 48);
    engine.releaseSnapshot(second);
    expect(engine.snapshotByteAccounting()).toMatchObject({
      snapshotCount: 0,
      mutableBytes: 0,
      sharedStyleBytes: 500 * 5,
    });
  });
  it("restores pending merger state, effects, timers, globals, topology, and exact digest", async () => {
    const galaxy = (id: string, x: number) => ({
        ...FIRST_LIGHT,
        id,
        generation: { ...FIRST_LIGHT.generation, starCount: 500 },
        position: { x, y: 0 },
        bulkVelocity: { x: 0, y: 0 },
      }),
      engine = new Engine(
        { galaxies: [galaxy("a", -3), galaxy("b", 3)], gravity: 2, playbackSpeed: 4 },
        true,
      );
    engine.step(1 / 120);
    const snapshot = engine.requestSnapshot(),
      digest = await engine.stateDigest();
    const mappings = engine.consumeMergerMappings();
    expect(mappings).toHaveLength(1);
    engine.gravity = 0.25;
    engine.playbackSpeed = 0.25;
    engine.step(1 / 120);
    engine.restoreSnapshot(snapshot);
    expect(engine.playing).toBe(false);
    expect(engine.gravity).toBe(2);
    expect(engine.playbackSpeed).toBe(4);
    expect(engine.consumeMergerMappings()).toEqual(mappings);
    expect(await engine.stateDigest()).toBe(digest);
  });
});
