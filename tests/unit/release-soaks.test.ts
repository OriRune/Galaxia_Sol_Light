import { describe, expect, it } from "vitest";
import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import { Engine } from "../../src/simulation/engine";
import { RecordingSlotScheduler } from "../../src/capture/recordingScheduler";

const galaxy = (id: string, x: number, velocity = 0) => ({
  id,
  name: id,
  generation: { ...DEFAULT_GENERATION, seed: id.length, starCount: 500 },
  position: { x, y: 0 },
  bulkVelocity: { x: velocity, y: 0 },
});

describe("release soak gates", () => {
  it("covers thirty fake-clock minutes of generated simulation/app actions", async () => {
    const base = { galaxies: [galaxy("base", 0)], gravity: 1, playbackSpeed: 1 as const };
    const engine = new Engine(base, true);
    const counts = { play: 0, add: 0, merge: 0, rewind: 0, undo: 0, replace: 0, capture: 0 };
    for (let tick = 1; tick <= 1_800; tick += 1) {
      expect(engine.step(1)).toBe(true);
      counts.play += 1;
      if (tick % 30 === 0) {
        engine.loadSetup(
          {
            galaxies: [galaxy(`merge-a-${String(tick)}`, -3), galaxy(`merge-b-${String(tick)}`, 3)],
            gravity: 1,
            playbackSpeed: 1,
          },
          true,
        );
        expect(engine.step(0.1)).toBe(true);
        expect(engine.galaxyCount).toBe(1);
        counts.merge += 1;
      } else if (tick % 20 === 0) {
        engine.loadSetup(base, true);
        engine.addGalaxy(galaxy(`added-${String(tick)}`, 100));
        counts.add += 1;
      } else if (tick % 15 === 0) {
        const snapshot = engine.requestSnapshot();
        engine.step(0.1);
        engine.restoreSnapshot(snapshot);
        engine.releaseSnapshot(snapshot);
        counts.undo += 1;
      } else if (tick % 12 === 0) {
        const checkpoint = engine.createCheckpoint();
        engine.step(0.1);
        engine.restoreCheckpoint(checkpoint);
        counts.rewind += 1;
      } else if (tick % 10 === 0) {
        engine.loadSetup(base, true);
        counts.replace += 1;
      }
      if (tick % 180 === 0) {
        expect(await engine.stateDigest()).toMatch(/^[0-9a-f]{64}$/);
        counts.capture += 1;
      }
    }
    expect(counts).toEqual({
      play: 1_800,
      add: 60,
      merge: 60,
      rewind: 120,
      undo: 60,
      replace: 60,
      capture: 10,
    });
  }, 120_000);

  it("runs thirty fake-clock recording minutes without the product duration limit", () => {
    const slots = 30 * 60 * 30;
    const scheduler = new RecordingSlotScheduler(0, slots);
    let captured = 0;
    for (let slot = 0; slot < slots; slot += 1) {
      const result = scheduler.pass(((slot + 1) * 1000) / 30 + 0.01, 0);
      if (result?.candidate !== null && result?.candidate !== undefined) captured += 1;
    }
    expect(captured).toBe(slots);
    expect(scheduler.pass(30 * 60 * 1000 + 1, 0)).toBeNull();
  });
});
