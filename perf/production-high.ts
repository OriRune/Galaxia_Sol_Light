import type { EngineSetup, GalaxyRecord, GalaxyType } from "../src/domain/types";
import { PixiViewport } from "../src/rendering/PixiViewport";
import { SimulationClient } from "../src/simulation/client";

export interface ProductionHighResult {
  averageFps: number;
  p95FrameMs: number;
  p95ResponseMs: number;
  frameIntervalsMs: number[];
  visibleResponsesMs: number[];
  frames: number;
  starCount: number;
}
export type ProductionFixture = "low" | "balanced" | "high";
function p95(values: readonly number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1] ?? Number.POSITIVE_INFINITY;
}
function setup(fixture: ProductionFixture): EngineSetup {
  if (fixture === "low")
    return {
      galaxies: [
        {
          id: "first-light",
          name: "First Light",
          generation: {
            type: "spiral",
            seed: 1,
            starCount: 10_000,
            size: 40,
            mass: 25,
            spin: 1,
            armCount: 2,
            blackHole: false,
          },
          position: { x: 0, y: 0 },
          bulkVelocity: { x: 0, y: 0 },
        },
      ],
      gravity: 1,
      playbackSpeed: 1,
    };
  if (fixture === "balanced")
    return {
      galaxies: [1, 2].map((seed, index) => ({
        id: `balanced-${String(seed)}`,
        name: null,
        generation: {
          type: "spiral" as const,
          seed,
          starCount: 15_000,
          size: 40,
          mass: 25,
          spin: 1,
          armCount: 2,
          blackHole: false,
        },
        position: { x: index === 0 ? -80 : 80, y: 0 },
        bulkVelocity: { x: 0, y: index === 0 ? 2 : -2 },
      })),
      gravity: 1,
      playbackSpeed: 1,
    };
  const types: GalaxyType[] = ["spiral", "barredSpiral", "elliptical", "irregular", "dwarf"];
  const galaxies: GalaxyRecord[] = types.map((type, index) => {
    const angle = (index / types.length) * Math.PI * 2,
      x = Math.cos(angle) * 200,
      y = Math.sin(angle) * 200;
    return {
      id: `high-${String(index + 1)}`,
      name: null,
      generation: {
        type,
        seed: index + 1,
        starCount: 12000,
        size: 40,
        mass: 25,
        spin: 1,
        armCount: type === "spiral" || type === "barredSpiral" ? 2 : null,
        blackHole: false,
      },
      position: { x, y },
      bulkVelocity: { x: -Math.sin(angle) * 2, y: Math.cos(angle) * 2 },
    };
  });
  return { galaxies, gravity: 1, playbackSpeed: 1 };
}
export async function runProductionHigh(
  host: HTMLElement,
  warmupMs: number,
  measurementMs: number,
  fixture: ProductionFixture = "high",
): Promise<ProductionHighResult> {
  host.dataset.phase = "mounting";
  const viewport = new PixiViewport();
  await viewport.mount(host);
  viewport.resize(1920, 1080, devicePixelRatio);
  viewport.setTrails(true);
  viewport.setAutomaticFraming(true);
  let starCount = 0;
  const intervals: number[] = [],
    responses: number[] = [];
  let last = 0,
    start = 0,
    lastInput = 0,
    inputIndex = 0;
  const client = new SimulationClient(undefined, {
    commitCommandEvents: (_requestId, next) => {
      if (next) {
        starCount = next.segments.reduce((sum, segment) => sum + segment.count, 0);
        viewport.applyTopology(next);
      }
    },
    commitAutomaticEvents: (next) => {
      starCount = next.segments.reduce((sum, segment) => sum + segment.count, 0);
      viewport.applyTopology(next);
    },
    applyFrame: (frame, positions) => {
      viewport.applyFrame(frame, new Float32Array(positions));
    },
  });
  host.dataset.phase = "initializing";
  await client.initialize(setup(fixture), true);
  host.dataset.phase = "measuring";
  await new Promise<void>((resolve) => {
    const loop = (timestamp: number) => {
      if (start === 0) {
        start = timestamp;
        last = timestamp;
      }
      const elapsed = timestamp - start;
      if (elapsed >= warmupMs && last > 0) intervals.push(timestamp - last);
      if (lastInput > 0) {
        responses.push(timestamp - lastInput);
        lastInput = 0;
      }
      if (elapsed >= warmupMs + measurementMs) {
        resolve();
        return;
      }
      if (elapsed >= warmupMs && Math.floor((elapsed - warmupMs) / 2000) > inputIndex) {
        inputIndex += 1;
        lastInput = timestamp;
        switch (inputIndex % 4) {
          case 0:
            viewport.panByCssPixels(20, 0);
            viewport.setAutomaticFraming(true);
            break;
          case 1:
            viewport.zoomAtCssPoint(1.05, 960, 540);
            viewport.setAutomaticFraming(true);
            break;
          case 2:
            viewport.pickAtCssPoint(960, 540);
            break;
          default:
            void client.mutation("PAUSE", {}).then(() => client.mutation("PLAY", {}));
        }
      }
      client.tick(timestamp);
      last = timestamp;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  host.dataset.phase = "complete";
  const seconds = intervals.reduce((sum, value) => sum + value, 0) / 1000;
  const result = {
    averageFps: seconds === 0 ? 0 : intervals.length / seconds,
    p95FrameMs: p95(intervals),
    p95ResponseMs: p95(responses),
    frameIntervalsMs: intervals,
    visibleResponsesMs: responses,
    frames: intervals.length,
    starCount,
  };
  setTimeout(() => {
    host.dataset.phase = "disposing";
    void client.dispose().finally(() => {
      viewport.destroy();
      host.dataset.phase = "disposed";
    });
  }, 1000);
  return result;
}
