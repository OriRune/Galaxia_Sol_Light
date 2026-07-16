import { expect, it } from "vitest";
import { frameLiveBounds, screenToWorld, worldToScreen } from "../../src/rendering/camera";

it("scenario 16 frames an empty scene and preserves pan/zoom coordinate identity", () => {
  const camera = {
    centerX: 17,
    centerY: -9,
    zoom: 7,
    cssWidth: 1280,
    cssHeight: 720,
    devicePixelRatio: 2,
  };
  const point = { x: -123.5, y: 88.25 };
  expect(screenToWorld(camera, worldToScreen(camera, point))).toEqual(point);
  expect(frameLiveBounds(camera, [], [])).toMatchObject({ centerX: 0, centerY: 0, zoom: 5 });
});
