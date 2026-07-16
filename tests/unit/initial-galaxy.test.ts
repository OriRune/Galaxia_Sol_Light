import { describe, expect, it } from "vitest";
import { FIRST_LIGHT } from "../../src/domain/defaults";
import { initialGalaxiesForRuntime, initialGalaxyForRuntime } from "../../src/app/initialGalaxy";

describe("initialGalaxyForRuntime", () => {
  it("uses the exact first-light default outside an enabled E2E fixture", () => {
    expect(initialGalaxyForRuntime(false, "low")).toBe(FIRST_LIGHT);
    expect(initialGalaxyForRuntime(true, null)).toBe(FIRST_LIGHT);
  });

  it("uses a bounded star count for the explicit E2E fixture", () => {
    const galaxy = initialGalaxyForRuntime(true, "low");

    expect(galaxy).not.toBe(FIRST_LIGHT);
    expect(galaxy.generation.starCount).toBe(500);
    expect(galaxy.id).toBe(FIRST_LIGHT.id);
  });

  it("loads the exact five-galaxy High fixture only behind test hooks", () => {
    const high = initialGalaxiesForRuntime(true, "high");
    expect(high).toHaveLength(5);
    expect(high.map((galaxy) => galaxy.generation.type)).toEqual([
      "spiral",
      "barredSpiral",
      "elliptical",
      "irregular",
      "dwarf",
    ]);
    expect(high.every((galaxy) => galaxy.generation.starCount === 12_000)).toBe(true);
    expect(initialGalaxiesForRuntime(false, "high")).toEqual([FIRST_LIGHT]);
  });
});
