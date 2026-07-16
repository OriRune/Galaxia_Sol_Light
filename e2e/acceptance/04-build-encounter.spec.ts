import { expect, test } from "@playwright/test";

test("R-MODE-02 Collision adds galaxies without removing the existing scene", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/?fixture=low");
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect(page.getByText(/Paused.*1 galaxies.*500 stars/)).toBeVisible();
  await page.getByRole("tab", { name: "Collision" }).click();
  await page.getByLabel("Star count").fill("500");
  await expect(page.getByLabel("Star count")).toHaveValue("500");
  await expect(page.getByText("Simulation: ready")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add galaxy" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Add galaxy" }).click();
  await expect(page.getByRole("img")).toHaveAttribute("aria-label", /2 galaxies/, {
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Delete selected galaxy" })).toBeEnabled();
  await page.getByLabel("Seed").fill("2");
  await expect(page.getByRole("button", { name: "Add galaxy" })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Add galaxy" }).click();
  await expect(page.getByRole("img")).toHaveAttribute("aria-label", /3 galaxies/, {
    timeout: 30_000,
  });
});
