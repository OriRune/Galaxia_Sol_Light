import path from "node:path";
import { expect, test } from "@playwright/test";

for (const particleCount of [10_000, 30_000, 120_000]) {
  test(`${String(particleCount)} particle informational case`, async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await page.goto(
      `/?harness=performance&driver=31.0.137.0&particles=${String(particleCount)}&warmupMs=1000&measurementMs=5000&runs=1`,
    );
    await page.getByRole("button", { name: "Run all" }).click();
    const download = await downloadPromise;
    await download.saveAs(
      path.resolve(`docs/evidence/renderer-proxy-informational-${String(particleCount)}.json`),
    );
    await expect(page.locator("output")).toContainText("FPS");
  });
}
