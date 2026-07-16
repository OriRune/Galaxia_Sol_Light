import { expect, it } from "vitest";
import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import { Engine } from "../../src/simulation/engine";

it("scenario 7 exposes the black-hole core luminance contract", () => {
  const engine = new Engine(
    {
      galaxies: [
        {
          id: "black-hole",
          generation: { ...DEFAULT_GENERATION, starCount: 500, blackHole: true },
          name: null,
          position: { x: 0, y: 0 },
          bulkVelocity: { x: 0, y: 0 },
        },
      ],
      gravity: 1,
      playbackSpeed: 1,
    },
    false,
  );
  expect(engine.requestedPeakLinearY("black-hole")).toBe(0.07);
});
