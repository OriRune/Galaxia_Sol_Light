import { describe, expect, it } from "vitest";

import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import {
  BLACK_HOLE_SOFTENING_FRACTION,
  EXTENDED_SOFTENING_FRACTION,
  ownerRadialAcceleration,
  plummerRadialAcceleration,
} from "../../src/domain/physicsContract";
import type { GalaxyGenerationConfig } from "../../src/domain/types";
import { generateSpiral } from "../../src/generation/generators/spiral";
import type { GeneratedGalaxy, GenerationDiagnostics } from "../../src/generation/shared";

function config(overrides: Partial<GalaxyGenerationConfig> = {}): GalaxyGenerationConfig {
  return { ...DEFAULT_GENERATION, starCount: 500, ...overrides };
}

function valueAt(array: Float32Array, index: number) {
  const value = array[index];
  if (value === undefined) throw new RangeError("Generated array index is out of bounds.");
  return value;
}

function meanCoreSpeed(galaxy: GeneratedGalaxy, coreRadius: number) {
  let sum = 0;
  let count = 0;
  for (let index = 0; index < galaxy.x.length; index += 1) {
    if (Math.hypot(valueAt(galaxy.x, index), valueAt(galaxy.y, index)) <= coreRadius) {
      sum += Math.hypot(valueAt(galaxy.vx, index), valueAt(galaxy.vy, index));
      count += 1;
    }
  }
  return sum / count;
}

describe("spiral generator", () => {
  it("allocates exact typed-array lengths and finite bounded values", () => {
    const generation = config({ size: 73, starCount: 777 });
    const galaxy = generateSpiral(generation);
    for (const key of ["x", "y", "vx", "vy"] as const) {
      expect(galaxy[key]).toBeInstanceOf(Float32Array);
      expect(galaxy[key]).toHaveLength(generation.starCount);
      expect(Array.from(galaxy[key]).every(Number.isFinite)).toBe(true);
    }
    for (const key of ["red", "green", "blue", "alpha", "pointSize"] as const) {
      expect(galaxy[key]).toBeInstanceOf(Uint8Array);
      expect(galaxy[key]).toHaveLength(generation.starCount);
    }
    for (let index = 0; index < generation.starCount; index += 1) {
      expect(Math.hypot(valueAt(galaxy.x, index), valueAt(galaxy.y, index))).toBeLessThanOrEqual(
        generation.size + 0.00001,
      );
      expect(galaxy.alpha[index]).toBeGreaterThanOrEqual(150);
      expect(galaxy.alpha[index]).toBeLessThanOrEqual(240);
      expect([1, 2, 3]).toContain(galaxy.pointSize[index]);
    }
  });

  it("places all ten reserved indices inside the core at the minimum count", () => {
    const generation = config({ starCount: 500, size: 10 });
    const galaxy = generateSpiral(generation);
    const coreRadius = Math.max(2, generation.size * 0.1);
    for (let index = 0; index < 10; index += 1) {
      expect(Math.hypot(valueAt(galaxy.x, index), valueAt(galaxy.y, index))).toBeLessThan(
        coreRadius,
      );
    }
  });

  it("is deterministic and leaves positions identical across black-hole state", () => {
    const off = config({ seed: 0xfedcba98, blackHole: false });
    const first = generateSpiral(off);
    const repeat = generateSpiral(off);
    const on = generateSpiral({ ...off, blackHole: true });
    expect(first).toEqual(repeat);
    expect(on.x).toEqual(first.x);
    expect(on.y).toEqual(first.y);
    expect(on.vx).not.toEqual(first.vx);
    expect(on.red).not.toEqual(first.red);
  });

  it("consumes every stream's fixed draw count regardless of branches", () => {
    const generation = config({ starCount: 503, spin: -1 });
    const diagnostics: GenerationDiagnostics = {
      positionDraws: 0,
      positionJitterDraws: 0,
      velocityDraws: 0,
      styleDraws: 0,
    };
    generateSpiral(generation, diagnostics);
    expect(diagnostics).toEqual({
      positionDraws: 4 * generation.starCount,
      positionJitterDraws: 12 * generation.starCount,
      velocityDraws: 24 * generation.starCount,
      styleDraws: 4 * generation.starCount,
    });
  });

  it("raises inner mean speed by at least five percent without changing mass", () => {
    const off = config({ blackHole: false, seed: 418, size: 40, mass: 25 });
    const on = { ...off, blackHole: true };
    const coreRadius = Math.max(2, off.size * 0.1);
    expect(meanCoreSpeed(generateSpiral(on), coreRadius)).toBeGreaterThanOrEqual(
      1.05 * meanCoreSpeed(generateSpiral(off), coreRadius),
    );
    expect(on.mass).toBe(off.mass);
  });
});

describe("owner physics contract", () => {
  it("uses the fixed Plummer component split and gravity scaling", () => {
    const generation = config({ size: 40, mass: 25, blackHole: true });
    const radius = 4;
    const gravity = 2;
    const expected =
      plummerRadialAcceleration(
        radius,
        generation.mass * 0.9,
        EXTENDED_SOFTENING_FRACTION * generation.size,
        gravity,
      ) +
      plummerRadialAcceleration(
        radius,
        generation.mass * 0.1,
        BLACK_HOLE_SOFTENING_FRACTION * Math.max(2, generation.size * 0.1),
        gravity,
      );
    expect(ownerRadialAcceleration(radius, generation, gravity)).toBe(expected);
    expect(ownerRadialAcceleration(0, generation, gravity)).toBe(0);
    expect(ownerRadialAcceleration(radius, generation, 0)).toBe(0);
  });
});
