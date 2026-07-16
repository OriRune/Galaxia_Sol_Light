import { describe, expect, it } from "vitest";
import {
  performancePlan,
  randomPlan,
  regeneratePlan,
  rerollSeed,
  setPlaying,
  startupScene,
} from "../../src/app/productControls";
import { FIRST_LIGHT } from "../../src/domain/defaults";
describe("playback, Random, and globals", () => {
  it("has exact startup and pause remembers selected speed", () => {
    const scene = startupScene();
    expect(scene).toMatchObject({
      gravity: 1,
      playbackSpeed: 1,
      performanceLevel: "balanced",
      trails: false,
      galaxies: [
        {
          id: "first-light",
          name: "First Light",
          generation: {
            type: "spiral",
            seed: 1,
            starCount: 30000,
            size: 40,
            mass: 25,
            spin: 1,
            armCount: 2,
            blackHole: false,
          },
          position: { x: 0, y: 0 },
          bulkVelocity: { x: 0, y: 0 },
        },
      ],
    });
    expect(setPlaying({ playing: true, selectedSpeed: 4 }, false)).toEqual({
      playing: false,
      selectedSpeed: 4,
    });
  });
  it("changes performance without altering existing explicit counts", () => {
    const scene = startupScene(),
      next = performancePlan(scene, "low");
    expect(next.performanceLevel).toBe("low");
    expect(next.galaxies[0]?.generation.starCount).toBe(30000);
  });
  it("regenerates with stored seeds", () => {
    const scene = startupScene();
    scene.galaxies.push({
      ...FIRST_LIGHT,
      id: "two",
      generation: { ...FIRST_LIGHT.generation, seed: 99 },
    });
    expect(regeneratePlan(scene).seeds).toEqual([1, 99]);
  });
  it("Random replaces, deselects, enables framing, and plays", () => {
    const plan = randomPlan("collision", "42", "balanced", true);
    expect(plan).toMatchObject({
      selection: null,
      automaticFraming: true,
      playing: true,
      scene: { performanceLevel: "balanced", trails: true, playbackSpeed: 1, gravity: 1 },
    });
    expect(plan?.scene.galaxies).toHaveLength(2);
  });
  it("invalid seed changes nothing and secure reroll follows eight-attempt fallback", () => {
    expect(randomPlan("single", "1.5", "low", false)).toBeNull();
    const cryptoSource = {
      getRandomValues: <T extends ArrayBufferView>(array: T) => {
        new Uint32Array(array.buffer, array.byteOffset, 1)[0] = 7;
        return array;
      },
    };
    expect(rerollSeed(7, cryptoSource)).toBe(8);
  });
});
