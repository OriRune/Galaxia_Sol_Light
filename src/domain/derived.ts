import type { GalaxyRecord } from "./types";

export function coreRadius(size: number) {
  return Math.max(2, size * 0.1);
}

export function sceneTotals(galaxies: readonly GalaxyRecord[]) {
  return galaxies.reduce(
    (totals, galaxy) => ({
      starCount: totals.starCount + galaxy.generation.starCount,
      mass: totals.mass + galaxy.generation.mass,
    }),
    { starCount: 0, mass: 0 },
  );
}
