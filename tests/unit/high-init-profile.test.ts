import { expect, it } from "vitest";
import { Engine } from "../../src/simulation/engine";
import type { EngineSetup, GalaxyType } from "../../src/domain/types";
import { DEFAULT_ENGINE_SETUP } from "../../src/domain/defaults";

it("commits one production First Light step without starving Worker commands", () => {
  const engine = new Engine(structuredClone(DEFAULT_ENGINE_SETUP), true),
    start = performance.now();
  expect(engine.step(1 / 60)).toBe(true);
  const elapsed = performance.now() - start;
  console.info(`FIRST_LIGHT_STEP_MS ${elapsed.toFixed(1)}`);
  expect(elapsed).toBeLessThan(5_000);
});

it("constructs the exact High engine within the reconstruction timeout", () => {
  const types: GalaxyType[] = ["spiral", "barredSpiral", "elliptical", "irregular", "dwarf"];
  const setup: EngineSetup = {
    gravity: 1,
    playbackSpeed: 1,
    galaxies: types.map((type, index) => {
      const angle = (index / 5) * Math.PI * 2;
      return {
        id: `high-${String(index)}`,
        name: null,
        generation: {
          type,
          seed: index + 1,
          starCount: 12000,
          size: 40,
          mass: 25,
          spin: 1,
          armCount: type === "spiral" || type === "barredSpiral" ? 2 : null,
          blackHole: false,
        },
        position: { x: Math.cos(angle) * 200, y: Math.sin(angle) * 200 },
        bulkVelocity: { x: -Math.sin(angle) * 2, y: Math.cos(angle) * 2 },
      };
    }),
  };
  const start = performance.now();
  const engine = new Engine(setup, true);
  const elapsed = performance.now() - start;
  expect(engine.starCount).toBe(60000);
  expect(elapsed).toBeLessThan(30000);
});
