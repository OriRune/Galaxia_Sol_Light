import type { CoreFrame, GalaxyBounds } from "../simulation/protocol";

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 100;
export const DEFAULT_ZOOM = 5;

export interface CameraState {
  centerX: number;
  centerY: number;
  zoom: number;
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
}

export interface CssPoint {
  x: number;
  y: number;
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function worldToScreen(camera: CameraState, point: CssPoint): CssPoint {
  return {
    x: (point.x - camera.centerX) * camera.zoom + camera.cssWidth / 2,
    y: camera.cssHeight / 2 - (point.y - camera.centerY) * camera.zoom,
  };
}

export function screenToWorld(camera: CameraState, point: CssPoint): CssPoint {
  return {
    x: (point.x - camera.cssWidth / 2) / camera.zoom + camera.centerX,
    y: (camera.cssHeight / 2 - point.y) / camera.zoom + camera.centerY,
  };
}

export function zoomAtPoint(camera: CameraState, factor: number, point: CssPoint): CameraState {
  const before = screenToWorld(camera, point);
  const zoom = clampZoom(camera.zoom * factor);
  return {
    ...camera,
    zoom,
    centerX: before.x - (point.x - camera.cssWidth / 2) / zoom,
    centerY: before.y - (camera.cssHeight / 2 - point.y) / zoom,
  };
}

export function panCamera(camera: CameraState, deltaX: number, deltaY: number): CameraState {
  return {
    ...camera,
    centerX: camera.centerX - deltaX / camera.zoom,
    centerY: camera.centerY + deltaY / camera.zoom,
  };
}

export function resetCamera(camera: CameraState): CameraState {
  return { ...camera, centerX: 0, centerY: 0, zoom: DEFAULT_ZOOM };
}

export function frameLiveBounds(
  camera: CameraState,
  bounds: readonly GalaxyBounds[],
  cores: readonly CoreFrame[],
): CameraState {
  if (bounds.length === 0 && cores.length === 0) return resetCamera(camera);
  let minX = Number.POSITIVE_INFINITY,
    minY = Number.POSITIVE_INFINITY,
    maxX = Number.NEGATIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY;
  for (const bound of bounds) {
    minX = Math.min(minX, bound.minX);
    minY = Math.min(minY, bound.minY);
    maxX = Math.max(maxX, bound.maxX);
    maxY = Math.max(maxY, bound.maxY);
  }
  for (const core of cores) {
    minX = Math.min(minX, core.x - core.coreRadius);
    minY = Math.min(minY, core.y - core.coreRadius);
    maxX = Math.max(maxX, core.x + core.coreRadius);
    maxY = Math.max(maxY, core.y + core.coreRadius);
  }
  const paddedWidth = Math.max(1, (maxX - minX) * 1.2);
  const paddedHeight = Math.max(1, (maxY - minY) * 1.2);
  return {
    ...camera,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    zoom: clampZoom(Math.min(camera.cssWidth / paddedWidth, camera.cssHeight / paddedHeight)),
  };
}

export type AutomaticFramingEvent =
  | {
      type:
        | "STARTUP"
        | "RANDOM_GENERATED"
        | "SCENE_LOADED"
        | "SINGLE_SCENE_REPLACED"
        | "PRESET_APPLIED_SINGLE";
    }
  | {
      type:
        | "PRESET_APPLIED_MULTI"
        | "IN_PLACE_EDIT"
        | "GALAXY_ADDED"
        | "UNDO"
        | "HISTORY_NAVIGATED"
        | "CAMERA_RESET"
        | "SCENE_PRESERVING_MODE_CHANGE";
    }
  | { type: "MANUAL_PAN_OR_ZOOM" }
  | { type: "EXPLICIT_TOGGLE"; enabled: boolean };

export function automaticFramingReducer(current: boolean, event: AutomaticFramingEvent): boolean {
  switch (event.type) {
    case "STARTUP":
    case "RANDOM_GENERATED":
    case "SCENE_LOADED":
    case "SINGLE_SCENE_REPLACED":
    case "PRESET_APPLIED_SINGLE":
      return true;
    case "MANUAL_PAN_OR_ZOOM":
      return false;
    case "EXPLICIT_TOGGLE":
      return event.enabled;
    default:
      return current;
  }
}
