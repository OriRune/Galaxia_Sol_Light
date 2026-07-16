import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { z } from "zod";

const trailSchema = z.object({
  elapsedSeconds: z.number(),
  activeTexels: z.number(),
  medianY: z.number(),
  p99Y: z.number(),
  standardDeviationY: z.number(),
});
const runSchema = z.object({
  averageFps: z.number(),
  p95FrameIntervalMs: z.number(),
  p95VisibleResponseMs: z.number(),
  trailSamples: z.array(trailSchema),
  webgl: z.object({ renderer: z.string() }),
});
const envelopeSchema = z.object({
  qualifyingSurface: z.literal(true),
  results: z.array(runSchema).length(3),
});

test("system Edge 60k normative renderer gate", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.goto(
    "/?harness=performance&driver=31.0.137.0&particles=60000&warmupMs=5000&measurementMs=60000&runs=3",
  );
  await page.getByRole("button", { name: "Run all" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Normative benchmark download is unavailable.");
  const envelope = envelopeSchema.parse(JSON.parse(await readFile(downloadPath, "utf8")));
  const diagnostic =
    process.env.BENCHMARK_PORT !== undefined && process.env.BENCHMARK_PORT !== "4174";
  await download.saveAs(
    path.resolve(
      diagnostic
        ? "docs/evidence/renderer-proxy-system-edge-diagnostic.json"
        : "docs/evidence/renderer-proxy-system-edge.json",
    ),
  );
  for (const run of envelope.results) {
    expect(run.webgl.renderer).not.toContain("SwiftShader");
    expect(run.averageFps).toBeGreaterThanOrEqual(40);
    expect(run.p95FrameIntervalMs).toBeLessThanOrEqual(37.5);
    expect(run.p95VisibleResponseMs).toBeLessThanOrEqual(75);
    const five = run.trailSamples.find((sample) => sample.elapsedSeconds === 5);
    const sixty = run.trailSamples.find((sample) => sample.elapsedSeconds === 60);
    expect(five?.activeTexels).toBeGreaterThanOrEqual(100);
    expect(sixty?.activeTexels).toBeGreaterThanOrEqual(100);
    expect((sixty?.p99Y ?? 0) / Math.max(sixty?.medianY ?? 0, 1 / 255)).toBeGreaterThanOrEqual(2);
    expect(sixty?.standardDeviationY ?? 0).toBeGreaterThanOrEqual(
      (five?.standardDeviationY ?? 0) * 0.5,
    );
  }
});
