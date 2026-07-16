import { expect, test } from "@playwright/test";
import type { ProductionFixture, ProductionHighResult } from "./production-high";
import fs from "node:fs";
import path from "node:path";

const fixtures: readonly [ProductionFixture, number][] = [
  ["low", 10_000],
  ["balanced", 30_000],
  ["high", 60_000],
];

for (const [fixture, expectedStars] of fixtures) {
  test(`full Worker production ${fixture} viewport meets its gates`, async ({ page }, testInfo) => {
    const normative = process.env.PRODUCTION_NORMATIVE === "1",
      warmup = normative ? 5000 : 2000,
      measurement = normative ? 60000 : 5000;
    await page.goto(
      `/?harness=performance&production=1&fixture=${fixture}&driver=${normative ? "31.0.137.0" : "focused"}&warmupMs=${String(warmup)}&measurementMs=${String(measurement)}&runs=1&autorun=1`,
    );
    const output = page.locator("output");
    await expect(output).not.toHaveText(/^(?:Ready|Running)$/, { timeout: 90_000 });
    const raw = await output.getAttribute("data-result");
    expect(raw).not.toBeNull();
    const result = JSON.parse(raw ?? "null") as ProductionHighResult;
    expect(result.starCount).toBe(expectedStars);
    expect(result.averageFps).toBeGreaterThanOrEqual(30);
    expect(result.p95FrameMs).toBeLessThanOrEqual(50);
    expect(result.p95ResponseMs).toBeLessThanOrEqual(100);
    if (normative)
      fs.writeFileSync(
        path.resolve(`docs/evidence/production-${fixture}-${testInfo.project.name}.json`),
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            userAgent: await page.evaluate(() => navigator.userAgent),
            viewport: {
              width: 1920,
              height: 1080,
              dpr: await page.evaluate(() => devicePixelRatio),
            },
            result,
          },
          null,
          2,
        ),
      );
  });
}
