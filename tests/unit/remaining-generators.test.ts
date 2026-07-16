import { describe, expect, it } from "vitest";

import type { GalaxyGenerationConfig, GalaxyType } from "../../src/domain/types";
import { generateBarredSpiral } from "../../src/generation/generators/barredSpiral";
import { generateDwarf } from "../../src/generation/generators/dwarf";
import { generateElliptical } from "../../src/generation/generators/elliptical";
import { generateIrregular } from "../../src/generation/generators/irregular";
import { createGenerationStreams, polar, type GeneratedGalaxy } from "../../src/generation/shared";

type Generator = (generation: Readonly<GalaxyGenerationConfig>) => GeneratedGalaxy;

const generators: readonly (readonly [GalaxyType, Generator])[] = [
  ["barredSpiral", generateBarredSpiral],
  ["elliptical", generateElliptical],
  ["irregular", generateIrregular],
  ["dwarf", generateDwarf],
];

function config(type: GalaxyType, starCount = 4_000): GalaxyGenerationConfig {
  return {
    type,
    seed: 0x1234abcd,
    starCount,
    size: 60,
    mass: 30,
    spin: -1.25,
    armCount: type === "barredSpiral" ? 3 : null,
    blackHole: false,
  };
}

function valueAt(array: Float32Array, index: number) {
  const value = array[index];
  if (value === undefined) throw new RangeError("Generated array index is out of bounds.");
  return value;
}

function radiusAt(galaxy: GeneratedGalaxy, index: number) {
  return Math.hypot(valueAt(galaxy.x, index), valueAt(galaxy.y, index));
}

function covarianceEigenRatio(galaxy: GeneratedGalaxy) {
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (let index = 10; index < galaxy.x.length; index += 1) {
    const x = valueAt(galaxy.x, index);
    const y = valueAt(galaxy.y, index);
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  const trace = xx + yy;
  const difference = xx - yy;
  const discriminant = Math.sqrt(difference * difference + 4 * xy * xy);
  return Math.sqrt((trace - discriminant) / (trace + discriminant));
}

describe.each(generators)("%s generator", (type, generate) => {
  it("handles minimum and maximum allowed generation", () => {
    const minimum = generate({ ...config(type, 500), size: 10, mass: 1 });
    const maximum = generate({ ...config(type, 120_000), size: 100, mass: 1_200 });
    expect(minimum.x).toHaveLength(500);
    expect(maximum.x).toHaveLength(120_000);
    expect(Array.from(minimum.vx).every(Number.isFinite)).toBe(true);
    expect(Array.from(maximum.vy).every(Number.isFinite)).toBe(true);
    let maximumRadius = 0;
    for (let index = 0; index < maximum.x.length; index += 1) {
      maximumRadius = Math.max(maximumRadius, radiusAt(maximum, index));
    }
    expect(maximumRadius).toBeLessThanOrEqual(100.00001);
  });

  it("keeps the core ten inside the core radius", () => {
    const generation = config(type, 500);
    const galaxy = generate(generation);
    for (let index = 0; index < 10; index += 1) {
      expect(radiusAt(galaxy, index)).toBeLessThan(Math.max(2, generation.size * 0.1));
    }
  });

  it("is exactly deterministic", () => {
    const generation = config(type);
    expect(generate(generation)).toEqual(generate(generation));
  });
});

describe("remaining generator distributions", () => {
  it("barred spiral concentrates the specified bar population inside half-size", () => {
    const generation = config("barredSpiral", 20_000);
    const galaxy = generateBarredSpiral(generation);
    let inner = 0;
    for (let index = 10; index < galaxy.x.length; index += 1) {
      if (radiusAt(galaxy, index) < 0.5 * generation.size) inner += 1;
    }
    expect(inner / (galaxy.x.length - 10)).toBeGreaterThan(0.3);
  });

  it("elliptical covariance reflects its 0.55 through 0.80 axis ratio", () => {
    const galaxy = generateElliptical(config("elliptical", 20_000));
    expect(covarianceEigenRatio(galaxy)).toBeGreaterThan(0.55);
    expect(covarianceEigenRatio(galaxy)).toBeLessThan(0.8);
  });

  it("irregular stars cluster around exactly four variation centers", () => {
    const generation = config("irregular", 20_000);
    const streams = createGenerationStreams(generation);
    const centers = Array.from({ length: 4 }, () =>
      polar(
        0.45 * generation.size * Math.sqrt(streams.variation.nextFloat()),
        streams.variation.nextFloat(),
      ),
    );
    const galaxy = generateIrregular(generation);
    let nearAClump = 0;
    for (let index = 10; index < galaxy.x.length; index += 1) {
      const x = valueAt(galaxy.x, index);
      const y = valueAt(galaxy.y, index);
      if (
        centers.some((center) => Math.hypot(x - center.x, y - center.y) <= 0.3 * generation.size)
      ) {
        nearAClump += 1;
      }
    }
    expect(nearAClump / (galaxy.x.length - 10)).toBeGreaterThan(0.75);
  });

  it("dwarf uses the concentrated squared-radius profile and mild flattening", () => {
    const generation = config("dwarf", 20_000);
    const galaxy = generateDwarf(generation);
    const radii = Array.from({ length: galaxy.x.length - 10 }, (_, offset) =>
      radiusAt(galaxy, offset + 10),
    ).sort((left, right) => left - right);
    expect(radii[Math.floor(radii.length / 2)]).toBeLessThan(0.3 * generation.size);
    expect(covarianceEigenRatio(galaxy)).toBeGreaterThan(0.82);
    expect(covarianceEigenRatio(galaxy)).toBeLessThan(0.95);
  });
});
