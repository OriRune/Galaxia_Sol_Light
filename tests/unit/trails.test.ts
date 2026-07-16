import { describe, expect, it } from "vitest";
import {
  TRAIL_CLEAR_REASONS,
  trailFade,
  trailReprojection,
} from "../../src/rendering/TrailFeedback";

describe("trail feedback contract", () => {
  it("has an exact clear-event list", () => {
    expect(TRAIL_CLEAR_REASONS).toEqual([
      "scene-replacement",
      "empty-topology",
      "context-restored",
      "non-invertible-camera",
    ]);
  });
  it("uses a frame-rate-independent 1.2 second half-life", () => {
    expect(trailFade(1200)).toBeCloseTo(0.5, 12);
    expect(trailFade(600) ** 2).toBeCloseTo(0.5, 12);
  });
  it("leaves a fixed camera aligned and reprojects scripted pan/zoom", () => {
    expect(
      trailReprojection({ scale: 5, x: 100, y: 50 }, { scale: 5, x: 100, y: 50 }, 1000, 500),
    ).toEqual({ ratio: 1, x: 0, y: 0 });
    const result = trailReprojection(
      { scale: 5, x: 100, y: 50 },
      { scale: 10, x: 240, y: 80 },
      1000,
      500,
    );
    expect(result).toEqual({ ratio: 2, x: 0.54, y: 0.54 });
    const currentUv = (10 * 10 + 240) / 1000;
    const sampledUv = (currentUv - 0.5 - result.x) / result.ratio + 0.5;
    const priorUv = (10 * 5 + 100) / 1000;
    expect(Math.abs(sampledUv - priorUv) * 1000).toBeLessThanOrEqual(2);
  });
});
