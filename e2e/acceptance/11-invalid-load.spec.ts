import { expect, test } from "@playwright/test";

test("R-SCENE-02 malformed and unknown-version imports reject atomically", async ({ page }) => {
  await page.goto("/?fixture=low");
  const sceneSummary = page.getByRole("img");
  await expect(sceneSummary).toHaveAttribute("aria-label", /1 galaxies, 500 stars/, {
    timeout: 30_000,
  });
  const input = page.getByLabel("Import scene");
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.locator(".viewport-message")).toHaveText("INVALID_IMPORT");
  await expect(sceneSummary).toHaveAttribute("aria-label", /1 galaxies, 500 stars/);
  await input.setInputFiles({
    name: "future.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ kind: "galaxia-scene", schemaVersion: 999 })),
  });
  await expect(page.locator(".viewport-message")).toHaveText("INVALID_IMPORT");
  await expect(sceneSummary).toHaveAttribute("aria-label", /1 galaxies, 500 stars/);
});
