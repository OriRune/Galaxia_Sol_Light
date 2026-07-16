import { describe, expect, it } from "vitest";
import {
  automaticFramingReducer,
  frameLiveBounds,
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
  type AutomaticFramingEvent,
  type CameraState,
} from "../../src/rendering/camera";

const base: CameraState = {
  centerX: 12,
  centerY: -8,
  zoom: 5,
  cssWidth: 1000,
  cssHeight: 600,
  devicePixelRatio: 2,
};

describe("camera transforms and framing", () => {
  it.each([0.02, 5, 100])("round trips at zoom %s", (zoom) => {
    const camera = { ...base, zoom };
    const world = { x: -321.25, y: 194.75 };
    const result = screenToWorld(camera, worldToScreen(camera, world));
    expect(Math.abs(result.x - world.x) * zoom).toBeLessThanOrEqual(1);
    expect(Math.abs(result.y - world.y) * zoom).toBeLessThanOrEqual(1);
  });

  it("keeps the exact point under a point-centered zoom", () => {
    const pointer = { x: 137, y: 488 };
    const before = screenToWorld(base, pointer);
    const after = screenToWorld(zoomAtPoint(base, 7, pointer), pointer);
    expect(after.x).toBeCloseTo(before.x, 12);
    expect(after.y).toBeCloseTo(before.y, 12);
  });

  it("uses defaults for empty scenes and contains live bounds with 20 percent padding", () => {
    expect(frameLiveBounds(base, [], [])).toMatchObject({ centerX: 0, centerY: 0, zoom: 5 });
    const framed = frameLiveBounds(
      base,
      [{ id: "g", minX: -100, minY: -50, maxX: 100, maxY: 50 }],
      [
        {
          id: "g",
          sceneIndex: 0,
          x: 120,
          y: 0,
          vx: 0,
          vy: 0,
          coreRadius: 10,
          generationSize: 1,
          requestedPeakLinearY: 1,
        },
      ],
    );
    expect(framed.centerX).toBe(15);
    expect(framed.centerY).toBe(0);
    expect(framed.zoom).toBeCloseTo(1000 / (230 * 1.2));
    expect(230 * 1.2 * framed.zoom).toBeLessThanOrEqual(framed.cssWidth);
    expect(100 * 1.2 * framed.zoom).toBeLessThanOrEqual(framed.cssHeight);
  });
});

describe("automatic framing reducer", () => {
  it("implements every table row without an extra enabling event", () => {
    const enabling: AutomaticFramingEvent[] = [
      { type: "STARTUP" },
      { type: "RANDOM_GENERATED" },
      { type: "SCENE_LOADED" },
      { type: "SINGLE_SCENE_REPLACED" },
      { type: "PRESET_APPLIED_SINGLE" },
    ];
    for (const event of enabling) expect(automaticFramingReducer(false, event)).toBe(true);
    const preserving: AutomaticFramingEvent[] = [
      { type: "PRESET_APPLIED_MULTI" },
      { type: "IN_PLACE_EDIT" },
      { type: "GALAXY_ADDED" },
      { type: "UNDO" },
      { type: "HISTORY_NAVIGATED" },
      { type: "CAMERA_RESET" },
      { type: "SCENE_PRESERVING_MODE_CHANGE" },
    ];
    for (const event of preserving) {
      expect(automaticFramingReducer(false, event)).toBe(false);
      expect(automaticFramingReducer(true, event)).toBe(true);
    }
    expect(automaticFramingReducer(true, { type: "MANUAL_PAN_OR_ZOOM" })).toBe(false);
    expect(automaticFramingReducer(false, { type: "EXPLICIT_TOGGLE", enabled: true })).toBe(true);
    expect(automaticFramingReducer(true, { type: "EXPLICIT_TOGGLE", enabled: false })).toBe(false);
  });
});
