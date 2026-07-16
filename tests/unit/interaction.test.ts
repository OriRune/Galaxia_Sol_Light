import { describe, expect, it } from "vitest";
import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import { screenToWorld, type CameraState } from "../../src/rendering/camera";
import { DragSession, HitGrid } from "../../src/rendering/interaction";
import {
  PROTOCOL_VERSION,
  type CoreFrame,
  type TopologyEvent,
} from "../../src/simulation/protocol";

const camera: CameraState = {
  centerX: 0,
  centerY: 0,
  zoom: 5,
  cssWidth: 320,
  cssHeight: 200,
  devicePixelRatio: 1,
};
const core = (id: string, sceneIndex: number, x: number, radius = 2): CoreFrame => ({
  id,
  sceneIndex,
  x,
  y: 0,
  vx: 0,
  vy: 0,
  coreRadius: radius,
  generationSize: 40,
  requestedPeakLinearY: 1,
});

function topology(): TopologyEvent {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: "TOPOLOGY",
    modelRevision: 1,
    topologyEpoch: 4,
    causeRequestId: null,
    descriptors: [
      { id: "old", generation: { ...DEFAULT_GENERATION, starCount: 1 }, name: null },
      { id: "new", generation: { ...DEFAULT_GENERATION, starCount: 1 }, name: null },
    ],
    segments: [
      { ownerId: "old", start: 0, count: 1, styleBlockId: "a" },
      { ownerId: "new", start: 1, count: 1, styleBlockId: "b" },
    ],
    styleBlocks: [
      {
        id: "a",
        red: new Uint8Array([255]),
        green: new Uint8Array([255]),
        blue: new Uint8Array([255]),
        alpha: new Uint8Array([255]),
        pointSize: new Uint8Array([3]),
      },
      {
        id: "b",
        red: new Uint8Array([255]),
        green: new Uint8Array([255]),
        blue: new Uint8Array([255]),
        alpha: new Uint8Array([255]),
        pointSize: new Uint8Array([2]),
      },
    ],
  };
}

describe("rendered-footprint hit grid", () => {
  it("selects star-only and core-only footprints and rejects empty space", () => {
    const grid = new HitGrid();
    grid.applyTopology(topology());
    grid.applyFrame(
      camera,
      new Float32Array([-20, 0, 20, 0]),
      [core("old", 0, 0, 1), core("new", 1, 20, 2)],
      { modelRevision: 2, topologyEpoch: 4, frameId: 8 },
    );
    expect(grid.pick({ x: 60, y: 100 })).toBe("old");
    expect(grid.pick({ x: 260, y: 100 })).toBe("new");
    expect(grid.pick({ x: 160, y: 100 })).toBe("old");
    expect(grid.pick({ x: 10, y: 10 })).toBeNull();
  });

  it("chooses nearest projected core and newest scene index on an exact tie", () => {
    const grid = new HitGrid();
    grid.applyTopology(topology());
    grid.applyFrame(
      camera,
      new Float32Array([0, 0, 0, 0]),
      [core("old", 0, -1, 3), core("new", 1, 1, 3)],
      { modelRevision: 1, topologyEpoch: 4, frameId: 1 },
    );
    expect(grid.pick({ x: 160, y: 100 })).toBe("new");
    expect(grid.pick({ x: 156, y: 100 })).toBe("old");
  });

  it("retains its copied cache after the world buffer is returned", () => {
    const grid = new HitGrid();
    grid.applyTopology(topology());
    const positions = new Float32Array([-20, 0, 20, 0]);
    grid.applyFrame(camera, positions, [core("old", 0, 0), core("new", 1, 20)], {
      modelRevision: 3,
      topologyEpoch: 4,
      frameId: 9,
    });
    positions.fill(9999);
    expect(grid.pick({ x: 60, y: 100 })).toBe("old");
    expect(grid.getIdentity()).toEqual({ modelRevision: 3, topologyEpoch: 4, frameId: 9 });
  });
});

describe("drag sessions", () => {
  it("tracks a center within one pixel and commits only once", () => {
    const session = DragSession.center("g", 4, camera, { x: 0, y: 0 }, { x: 160, y: 100 });
    const pointer = { x: 207, y: 73 };
    const preview = session.update(pointer, 4, new Set(["g"]));
    const expected = screenToWorld(camera, pointer);
    expect(Math.abs((preview?.point.x ?? 0) - expected.x) * camera.zoom).toBeLessThanOrEqual(1);
    expect(Math.abs((preview?.point.y ?? 0) - expected.y) * camera.zoom).toBeLessThanOrEqual(1);
    expect(session.finish()).toEqual({ type: "MOVE_GALAXY", galaxyId: "g", position: expected });
    expect(session.finish()).toBeNull();
  });

  it("cancels on a stale topology and makes no mutation for invalid drags", () => {
    const stale = DragSession.center("g", 4, camera, { x: 0, y: 0 }, { x: 160, y: 100 });
    expect(stale.update({ x: 170, y: 100 }, 5, new Set(["g"]))).toBeNull();
    expect(stale.finish()).toBeNull();
    const invalid = DragSession.center("g", 4, camera, { x: 0, y: 0 }, { x: 160, y: 100 });
    expect(invalid.update({ x: 100000, y: 100 }, 4, new Set(["g"]))?.valid).toBe(false);
    expect(invalid.finish()).toBeNull();
    const velocity = DragSession.velocity("g", 4, camera, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(velocity.update({ x: 1000, y: 100 }, 4, new Set(["g"]))?.valid).toBe(false);
    expect(velocity.finish()).toBeNull();
  });
});
