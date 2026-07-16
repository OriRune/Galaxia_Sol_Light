import type { PerformanceLevel, PlaybackSpeed } from "./types";

export const UINT32_MAX = 0xffff_ffff;
export const MIN_STAR_COUNT = 500;
export const MAX_STAR_COUNT = 120_000;
export const MIN_SIZE = 10;
export const MAX_SIZE = 100;
export const MIN_MASS = 1;
export const MAX_MASS = 1_200;
export const MIN_SPIN = -2;
export const MAX_SPIN = 2;
export const MIN_ARM_COUNT = 1;
export const MAX_ARM_COUNT = 8;
export const MIN_POSITION = -10_000;
export const MAX_POSITION = 10_000;
export const MAX_BULK_SPEED = 20;
export const MIN_GRAVITY = 0.25;
export const MAX_GRAVITY = 4;
export const MAX_GALAXIES = 12;
export const MAX_SCENE_STARS = 120_000;
export const MAX_SCENE_MASS = 1_200;
export const MAX_NAME_CODE_POINTS = 80;
export const MAX_ID_CODE_POINTS = 100;

export const DEFAULT_CAMERA_CENTER = Object.freeze({ x: 0, y: 0 });
export const DEFAULT_CAMERA_ZOOM = 5;
export const MIN_CAMERA_ZOOM = 0.02;
export const MAX_CAMERA_ZOOM = 100;
export const AUTO_FRAME_PADDING = 1.2;
export const VELOCITY_HANDLE_SCALE = 2;

export const PERFORMANCE_STAR_BUDGETS: Readonly<Record<PerformanceLevel, number>> = Object.freeze({
  low: 10_000,
  balanced: 30_000,
  high: 60_000,
});

export const PLAYBACK_SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4] satisfies PlaybackSpeed[]);
