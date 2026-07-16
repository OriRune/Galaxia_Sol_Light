import { expect, it } from "vitest";
import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import { DragSession } from "../../src/rendering/interaction";

it("scenario 5 commits a valid center drag once and cancels after topology replacement", () => {
  expect(DEFAULT_GENERATION.starCount).toBeGreaterThan(0);
  const camera = {
    centerX: 0,
    centerY: 0,
    zoom: 5,
    cssWidth: 320,
    cssHeight: 200,
    devicePixelRatio: 1,
  };
  const committed = DragSession.center("g", 1, camera, { x: 0, y: 0 }, { x: 160, y: 100 });
  committed.update({ x: 210, y: 100 }, 1, new Set(["g"]));
  expect(committed.finish()).toMatchObject({ type: "MOVE_GALAXY", galaxyId: "g" });
  expect(committed.finish()).toBeNull();
  const stale = DragSession.center("g", 1, camera, { x: 0, y: 0 }, { x: 160, y: 100 });
  expect(stale.update({ x: 170, y: 100 }, 2, new Set(["g"]))).toBeNull();
  expect(stale.finish()).toBeNull();
});
