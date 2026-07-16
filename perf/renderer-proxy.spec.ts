import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { z } from "zod";

const envelopeSchema = z.object({
  results: z.array(
    z.object({
      frames: z.number(),
      trailSamples: z.array(z.object({ activeTexels: z.number() })).min(1),
      webgl: z.object({ renderer: z.string().min(1) }),
    }),
  ),
});

test("60k renderer proxy regression", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.goto(
    "/?harness=performance&driver=regression&particles=60000&warmupMs=1000&measurementMs=5000&runs=3",
  );
  await page.getByRole("button", { name: "Run all" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Benchmark download path is unavailable.");
  const body = envelopeSchema.parse(JSON.parse(await readFile(downloadPath, "utf8")));
  expect(body.results).toHaveLength(3);
  for (const result of body.results) {
    expect(result.frames).toBeGreaterThan(30);
    expect(result.trailSamples[0]?.activeTexels).toBeGreaterThanOrEqual(100);
  }
});
