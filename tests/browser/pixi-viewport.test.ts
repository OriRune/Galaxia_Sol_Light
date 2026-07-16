import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  type FrameEvent,
  type TopologyEvent,
} from "../../src/simulation/protocol";
import { PixiViewport } from "../../src/rendering/PixiViewport";
import { DEFAULT_GENERATION } from "../../src/domain/defaults";

function topology(epoch: number, count: number): TopologyEvent {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: "TOPOLOGY",
    modelRevision: epoch,
    topologyEpoch: epoch,
    causeRequestId: null,
    descriptors:
      count === 0
        ? []
        : [{ id: "g", generation: { ...DEFAULT_GENERATION, starCount: count }, name: null }],
    segments: count === 0 ? [] : [{ ownerId: "g", start: 0, count, styleBlockId: "s" }],
    styleBlocks:
      count === 0
        ? []
        : [
            {
              id: "s",
              red: new Uint8Array(count).fill(255),
              green: new Uint8Array(count).fill(160),
              blue: new Uint8Array(count).fill(80),
              alpha: new Uint8Array(count).fill(220),
              pointSize: new Uint8Array(count).fill(2),
            },
          ],
  };
}

function frame(epoch: number, positions: Float32Array): FrameEvent {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: "FRAME",
    leaseId: epoch,
    frameId: epoch,
    modelRevision: epoch,
    topologyEpoch: epoch,
    stepIndex: 0,
    positions: positions.buffer as ArrayBuffer,
    cores: [],
    bounds: [],
  };
}

describe("PixiViewport smoke lifecycle", () => {
  it("mounts explicit WebGL, resizes, reports metrics, and destroys", async () => {
    const host = document.createElement("div");
    Object.defineProperties(host, {
      clientWidth: { value: 640 },
      clientHeight: { value: 360 },
    });
    document.body.append(host);
    const viewport = new PixiViewport();
    expect(viewport.getMetrics()).toBeNull();
    viewport.resize(1, 1, 1);
    await viewport.mount(host);
    expect(host.querySelector("canvas")).not.toBeNull();
    expect(viewport.getMetrics()).toMatchObject({ renderer: "webgl", width: 640, height: 360 });
    viewport.resize(320, 180, 1);
    expect(viewport.getMetrics()?.devicePixelRatio).toBe(1);
    await expect(viewport.mount(host)).rejects.toThrow("already mounted");
    viewport.destroy();
    expect(viewport.getMetrics()).toBeNull();
    viewport.destroy();
    host.remove();
  });

  it("cancels an asynchronous mount when destroyed", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const viewport = new PixiViewport();
    const mounting = viewport.mount(host);
    viewport.destroy();
    await expect(mounting).rejects.toThrow("cancelled");
    expect(host.querySelector("canvas")).toBeNull();
    host.remove();
  });

  it("keeps styles topology-only, updates only positions per frame, and stays origin-clean", async () => {
    const host = document.createElement("div");
    Object.defineProperties(host, { clientWidth: { value: 320 }, clientHeight: { value: 180 } });
    document.body.append(host);
    const viewport = new PixiViewport();
    await viewport.mount(host);
    viewport.resize(320, 180, 1);
    viewport.applyTopology(topology(1, 3));
    expect(viewport.getDebugCounters()).toMatchObject({
      particles: 3,
      textures: 1,
      staticUploads: 1,
      positionUploads: 0,
    });
    viewport.applyFrame(frame(1, new Float32Array([10, 10, 20, 20, 30, 30])));
    viewport.applyFrame(frame(1, new Float32Array([11, 10, 21, 20, 31, 30])));
    expect(viewport.getDebugCounters()).toMatchObject({
      particles: 3,
      textures: 1,
      staticUploads: 1,
      positionUploads: 2,
    });
    expect(() => host.querySelector("canvas")?.toDataURL("image/png")).not.toThrow();
    viewport.destroy();
    expect(viewport.getDebugCounters()).toMatchObject({
      particles: 0,
      textures: 0,
      renderTextures: 0,
      listeners: 0,
      outstandingLeases: 0,
    });
    host.remove();
  });

  it("does not grow resource counters through five hundred scene replacements", async () => {
    const host = document.createElement("div");
    Object.defineProperties(host, { clientWidth: { value: 64 }, clientHeight: { value: 64 } });
    document.body.append(host);
    const viewport = new PixiViewport();
    await viewport.mount(host);
    for (let epoch = 1; epoch <= 500; epoch += 1)
      viewport.applyTopology(topology(epoch, epoch % 7));
    expect(viewport.getDebugCounters()).toMatchObject({
      particles: 3,
      textures: 1,
      renderTextures: 0,
      listeners: 2,
      outstandingLeases: 0,
      staticUploads: 500,
    });
    viewport.destroy();
    host.remove();
  });

  it("allocates exactly two feedback targets when trails are enabled", async () => {
    const host = document.createElement("div");
    Object.defineProperties(host, { clientWidth: { value: 64 }, clientHeight: { value: 64 } });
    document.body.append(host);
    const viewport = new PixiViewport();
    await viewport.mount(host);
    viewport.resize(64, 64, 1);
    viewport.applyTopology(topology(1, 1));
    viewport.setTrails(true);
    viewport.applyFrame(frame(1, new Float32Array([0, 0])));
    expect(viewport.getDebugCounters()).toMatchObject({ textures: 3, renderTextures: 2 });
    viewport.setTrails(false);
    viewport.destroy();
    expect(viewport.getDebugCounters()).toMatchObject({ textures: 0, renderTextures: 0 });
    host.remove();
  });

  it("exposes picking and one-commit center/velocity drag facade", async () => {
    const host = document.createElement("div");
    Object.defineProperties(host, { clientWidth: { value: 320 }, clientHeight: { value: 180 } });
    document.body.append(host);
    const viewport = new PixiViewport();
    await viewport.mount(host);
    viewport.resize(320, 180, 1);
    viewport.applyTopology(topology(1, 1));
    const event = frame(1, new Float32Array([0, 0]));
    event.cores = [
      {
        id: "g",
        sceneIndex: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        coreRadius: 2,
        generationSize: 40,
        requestedPeakLinearY: 0.05,
      },
    ];
    viewport.applyFrame(event);
    expect(viewport.pickAtCssPoint(160, 90)).toBe("g");
    const zoom = viewport.getCameraState().zoom,
      centerX = 10 / zoom,
      velocityX = 10 / zoom / 2;
    expect(viewport.beginCenterDrag("g", { x: 160, y: 90 })).toBe(true);
    expect(viewport.updateCenterDrag({ x: 170, y: 90 })).toMatchObject({ valid: true });
    expect(viewport.finishDrag()).toEqual({
      type: "MOVE_GALAXY",
      galaxyId: "g",
      position: { x: centerX, y: 0 },
    });
    expect(viewport.finishDrag()).toBeNull();
    expect(viewport.beginVelocityDrag("g", { x: 160, y: 90 })).toBe(true);
    expect(viewport.updateVelocityDrag({ x: 170, y: 90 })).toMatchObject({
      point: { x: velocityX, y: 0 },
      valid: true,
    });
    expect(viewport.finishDrag()).toEqual({
      type: "SET_BULK_VELOCITY",
      galaxyId: "g",
      velocity: { x: velocityX, y: 0 },
    });
    viewport.destroy();
    host.remove();
  });

  it("rebuilds cached topology and frame resources after WebGL context restoration", async () => {
    const host = document.createElement("div");
    Object.defineProperties(host, { clientWidth: { value: 64 }, clientHeight: { value: 64 } });
    document.body.append(host);
    const viewport = new PixiViewport();
    await viewport.mount(host);
    viewport.resize(64, 64, 1);
    viewport.applyTopology(topology(1, 1));
    viewport.setTrails(true);
    viewport.applyFrame(frame(1, new Float32Array([0, 0])));
    const canvas = host.querySelector("canvas");
    const gl = canvas?.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!canvas || !extension) throw new Error("WEBGL_lose_context unavailable.");
    const lost = new Promise<void>((resolve) => {
      canvas.addEventListener(
        "webglcontextlost",
        () => {
          resolve();
        },
        { once: true },
      );
    });
    extension.loseContext();
    await lost;
    viewport.applyFrame(frame(1, new Float32Array([1, 1])));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const restored = new Promise<void>((resolve) => {
      canvas.addEventListener(
        "webglcontextrestored",
        () => {
          resolve();
        },
        { once: true },
      );
    });
    extension.restoreContext();
    await restored;
    expect(viewport.getDebugCounters()).toMatchObject({
      particles: 1,
      textures: 3,
      renderTextures: 2,
      listeners: 2,
    });
    viewport.destroy();
    host.remove();
  });
});
