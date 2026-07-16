import type { DraftGalaxy } from "../domain/types";

export const BUILT_IN_PRESETS: readonly Readonly<DraftGalaxy>[] = Object.freeze([
  Object.freeze({
    name: "Grand Spiral",
    generation: Object.freeze({
      type: "spiral",
      seed: 101,
      starCount: 30_000,
      size: 40,
      mass: 25,
      spin: 1,
      armCount: 2,
      blackHole: false,
    }),
  }),
  Object.freeze({
    name: "Ember Bar",
    generation: Object.freeze({
      type: "barredSpiral",
      seed: 202,
      starCount: 30_000,
      size: 40,
      mass: 25,
      spin: 1,
      armCount: 2,
      blackHole: false,
    }),
  }),
  Object.freeze({
    name: "Golden Ellipse",
    generation: Object.freeze({
      type: "elliptical",
      seed: 303,
      starCount: 30_000,
      size: 40,
      mass: 25,
      spin: 0.6,
      armCount: null,
      blackHole: false,
    }),
  }),
  Object.freeze({
    name: "Tidepool",
    generation: Object.freeze({
      type: "irregular",
      seed: 404,
      starCount: 30_000,
      size: 40,
      mass: 25,
      spin: 0.4,
      armCount: null,
      blackHole: false,
    }),
  }),
  Object.freeze({
    name: "Small Wonder",
    generation: Object.freeze({
      type: "dwarf",
      seed: 505,
      starCount: 10_000,
      size: 25,
      mass: 8,
      spin: 0.7,
      armCount: null,
      blackHole: false,
    }),
  }),
]);
