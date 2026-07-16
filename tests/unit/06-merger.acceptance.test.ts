import { expect, it } from "vitest";
import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import { Engine } from "../../src/simulation/engine";

it("scenario 6 produces one deterministic remnant and preserves all stars", () => {
  const make = (id: string, x: number) => ({
    id,
    generation: { ...DEFAULT_GENERATION, starCount: 500 },
    name: id,
    position: { x, y: 0 },
    bulkVelocity: { x: 0, y: 0 },
  });
  const engine = new Engine(
    { galaxies: [make("a", -3), make("b", 3)], gravity: 1, playbackSpeed: 1 },
    true,
  );
  expect(engine.step(1 / 60)).toBe(true);
  expect(engine.galaxyCount).toBe(1);
  expect(engine.starCount).toBe(1_000);
  expect(engine.consumeMergerMappings()[0]?.inputIds).toEqual(["a", "b"]);
});
