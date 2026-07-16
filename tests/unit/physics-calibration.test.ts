import { describe, expect, it } from "vitest";
import { orderedCalibrationGrid, runCorePhysicsProof } from "../../perf/physics-calibration";

describe("starting core physics tuple", () => {
  it("defines the complete 324-tuple fallback grid in mandated nested order", () => {
    const grid = Array.from(orderedCalibrationGrid());
    expect(grid).toHaveLength(324);
    expect(grid[0]).toEqual({
      baseG: 60,
      extendedSofteningFraction: 0.12,
      tidalGain: 4,
      frictionGamma: 18,
      frictionSpeedScale: 2.5,
    });
    expect(grid.at(-1)).toEqual({
      baseG: 68,
      extendedSofteningFraction: 0.18,
      tidalGain: 5.5,
      frictionGamma: 30,
      frictionSpeedScale: 3.5,
    });
  });

  it("matches independent references and passes all core gates", () => {
    const result = runCorePhysicsProof();
    expect(result.defaultAttraction.separation).toBeCloseTo(94.91200877, 6);
    expect(result.defaultAttraction.decreaseRatio).toBeGreaterThanOrEqual(0.02);
    expect(result.scenario5.separation).toBeCloseTo(122.57215338, 6);
    expect(result.scenario5.rotationDegrees).toBeCloseTo(104.58194127, 6);
    expect(result.scenario5.merged).toBe(false);
    expect(result.slowCapture.mergeTime).toBeCloseTo(139.96666667, 6);
    expect(result.slowCapture.relativeSpeed).toBeCloseTo(0.69546443, 6);
    expect(result.fastFlyby.minimumFirstPassSpeedInsideMergerDistance).toBeCloseTo(16.25513293, 6);
    expect(result.fastFlyby.mergedBeforeSix).toBe(false);
    expect(result.fastFlyby.eventualMergeTime).toBeCloseTo(24.56666667, 6);
    expect(result.merger).toMatchObject({
      starCount: 5_000,
      mass: 50,
      blackHole: true,
      name: "Alpha + Beta",
    });
    expect(result.merger.size).toBeCloseTo(Math.sqrt(40 ** 2 + 50 ** 2), 12);
    expect(result.merger.x).toBeCloseTo(0.6, 12);
    expect(result.merger.vx).toBeCloseTo(0.02, 12);
    expect(result.maximumMomentumResidual).toBeLessThanOrEqual(result.maximumMomentumTolerance);
  });
});
