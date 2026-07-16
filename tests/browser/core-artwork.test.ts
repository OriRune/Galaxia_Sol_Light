import { describe, expect, it } from "vitest";
import {
  CoreArtwork,
  CORE_OFF_Y,
  CORE_ON_Y,
  reinhard,
  srgbToLinear,
  visibleCoreChannel,
} from "../../src/rendering/CoreArtwork";
import type { CoreFrame } from "../../src/simulation/protocol";

const fixture = (peak: number): CoreFrame => ({
  id: "g",
  sceneIndex: 0,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  coreRadius: 4,
  generationSize: 40,
  requestedPeakLinearY: peak,
});
function context(): { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext } {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true });
  if (!gl) throw new Error("WebGL2 required.");
  return { canvas, gl };
}
function visiblePeak(
  gl: WebGL2RenderingContext,
  art: CoreArtwork,
  peak: number,
  blackHole = false,
): number {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, 1024, 512);
  gl.clearColor(5 / 255, 8 / 255, 20 / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  art.setBlackHoles([["g", blackHole]]);
  art.draw([fixture(peak)], { scaleX: 8, scaleY: -8, x: 512, y: 256, dpr: 1 });
  const bytes = new Uint8Array(4);
  gl.readPixels(512, 255, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  return srgbToLinear((bytes[0] ?? 0) / 255);
}

describe("core artwork luminance", () => {
  it("passes float and independent visible ratios", () => {
    const { gl } = context(),
      art = new CoreArtwork(gl);
    const baseline = art.measurePeak(fixture(CORE_OFF_Y), false),
      bh = art.measurePeak(fixture(CORE_ON_Y), true),
      encounter = art.measurePeak(fixture(CORE_OFF_Y * 1.18), false),
      merger = art.measurePeak(fixture(CORE_OFF_Y * 1.3), false);
    expect(baseline).toBeLessThanOrEqual(0.07);
    expect(bh / baseline).toBeGreaterThanOrEqual(1.2);
    expect(encounter / baseline).toBeGreaterThanOrEqual(1.15);
    expect(merger / baseline).toBeGreaterThanOrEqual(1.25);
    const visibleBaseline = visiblePeak(gl, art, CORE_OFF_Y);
    expect(visiblePeak(gl, art, CORE_ON_Y, true) / visibleBaseline).toBeGreaterThanOrEqual(1.2);
    expect(visiblePeak(gl, art, CORE_OFF_Y * 1.18) / visibleBaseline).toBeGreaterThanOrEqual(1.15);
    expect(visiblePeak(gl, art, CORE_OFF_Y * 1.3) / visibleBaseline).toBeGreaterThanOrEqual(1.25);
    art.destroy();
  });
  it("keeps the worst chain unclamped below the fixed limits", () => {
    expect(7.75).toBeLessThan(8);
    expect(reinhard(7.75)).toBeLessThan(0.89);
    const background =
      0.2126 * srgbToLinear(5 / 255) +
      0.7152 * srgbToLinear(8 / 255) +
      0.0722 * srgbToLinear(20 / 255);
    expect(reinhard(CORE_OFF_Y) / background).toBeGreaterThanOrEqual(12);
    expect(visibleCoreChannel(7.75)).toBeLessThan(1);
  });
  it("uses a same-origin canvas whose artwork export succeeds", async () => {
    const { canvas, gl } = context(),
      art = new CoreArtwork(gl);
    art.draw([fixture(CORE_OFF_Y)], { scaleX: 8, scaleY: -8, x: 512, y: 256, dpr: 1 });
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    expect(blob?.type).toBe("image/png");
    art.destroy();
  });
});
