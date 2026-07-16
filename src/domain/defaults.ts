import { PERFORMANCE_STAR_BUDGETS } from "./ranges";
import type {
  DraftGalaxy,
  EngineSetup,
  GalaxyGenerationConfig,
  GalaxyRecord,
  SceneSetup,
} from "./types";

export const DEFAULT_GENERATION: Readonly<GalaxyGenerationConfig> = Object.freeze({
  type: "spiral",
  seed: 1,
  starCount: PERFORMANCE_STAR_BUDGETS.balanced,
  size: 40,
  mass: 25,
  spin: 1,
  armCount: 2,
  blackHole: false,
});

export const DEFAULT_DRAFT: Readonly<DraftGalaxy> = Object.freeze({
  generation: DEFAULT_GENERATION,
  name: null,
});

export const FIRST_LIGHT: Readonly<GalaxyRecord> = Object.freeze({
  id: "first-light",
  generation: DEFAULT_GENERATION,
  name: "First Light",
  position: Object.freeze({ x: 0, y: 0 }),
  bulkVelocity: Object.freeze({ x: 0, y: 0 }),
});

export const DEFAULT_ENGINE_SETUP: Readonly<EngineSetup> = Object.freeze({
  galaxies: Object.freeze([FIRST_LIGHT]) as unknown as GalaxyRecord[],
  gravity: 1,
  playbackSpeed: 1,
});

export const DEFAULT_SCENE_SETUP: Readonly<SceneSetup> = Object.freeze({
  galaxies: Object.freeze([FIRST_LIGHT]) as unknown as GalaxyRecord[],
  gravity: 1,
  playbackSpeed: 1,
  performanceLevel: "balanced",
  trails: false,
});
