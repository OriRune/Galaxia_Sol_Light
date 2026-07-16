import { expect, test } from "@playwright/test";

test("R-START-01 exact First Light startup and globals", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Galaxia" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Single" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Type")).toHaveValue("spiral");
  await expect(page.getByLabel("Seed")).toHaveValue("1");
  await expect(page.getByLabel("Star count")).toHaveValue("30000");
  await expect(page.getByLabel("Size")).toHaveValue("40");
  await expect(page.getByLabel("Mass")).toHaveValue("25");
  await expect(page.getByLabel("Spin")).toHaveValue("1");
  await expect(page.getByLabel("Name")).toHaveValue("First Light");
  await expect(page.getByText(/Playing.*1 galaxies.*30000 stars/)).toBeVisible();
});

test("R-PLAY-01 play pause remains responsive", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.getByText("Simulation: ready")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect(page.getByText(/Paused.*1 galaxies.*30000 stars/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Gravity")).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect(page.getByText(/Playing.*1 galaxies.*30000 stars/)).toBeVisible({
    timeout: 30_000,
  });
});
