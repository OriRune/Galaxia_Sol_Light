import { Application, Graphics, RenderTexture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { runRendererProxy } from "../../perf/renderer-proxy";

describe("renderer proxy trail target", () => {
  it("contains active star texels", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const result = await runRendererProxy(host, 1_000, 0, 500);
    expect(result.trailSamples[0]?.activeTexels).toBeGreaterThanOrEqual(100);
    host.remove();
  });
});

describe("Pixi render target", () => {
  it("extracts ordinary graphics", async () => {
    const application = new Application();
    await application.init({ preference: "webgl", width: 64, height: 64 });
    const target = RenderTexture.create({ width: 64, height: 64 });
    const graphics = new Graphics().rect(0, 0, 32, 32).fill(0xffffff);
    application.renderer.render({ container: graphics, target, clear: true });
    const bytes = application.renderer.extract.pixels({ target }).pixels;
    expect(bytes.some((value) => value > 0)).toBe(true);
    target.destroy(true);
    application.destroy(true);
  });
});
