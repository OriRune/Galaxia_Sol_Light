export type GalaxyType = "spiral" | "barredSpiral" | "elliptical" | "irregular" | "dwarf";
export type Mode = "single" | "collision" | "builder" | "random";
export type PerformanceLevel = "low" | "balanced" | "high";
export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4;
export type RandomCategory = "single" | "collision" | "cluster";

export interface Vec2 {
  x: number;
  y: number;
}

export interface GalaxyGenerationConfig {
  type: GalaxyType;
  seed: number;
  starCount: number;
  size: number;
  mass: number;
  spin: number;
  armCount: number | null;
  blackHole: boolean;
}

export interface GalaxyRecord {
  id: string;
  generation: GalaxyGenerationConfig;
  name: string | null;
  position: Vec2;
  bulkVelocity: Vec2;
}

export interface SceneSetup {
  galaxies: GalaxyRecord[];
  gravity: number;
  playbackSpeed: PlaybackSpeed;
  performanceLevel: PerformanceLevel;
  trails: boolean;
}

export interface EngineSetup {
  galaxies: GalaxyRecord[];
  gravity: number;
  playbackSpeed: PlaybackSpeed;
}

export interface DraftGalaxy {
  generation: GalaxyGenerationConfig;
  name: string | null;
}

export interface PresetFileV1 {
  kind: "galaxia-preset";
  schemaVersion: 1;
  generationVersion: 1;
  appVersion: string;
  id: string;
  name: string;
  exportedAt: string;
  payload: DraftGalaxy;
}

export interface SceneFileV1 {
  kind: "galaxia-scene";
  schemaVersion: 1;
  generationVersion: 1;
  appVersion: string;
  id: string;
  name: string;
  exportedAt: string;
  payload: SceneSetup;
}
