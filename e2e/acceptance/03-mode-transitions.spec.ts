import { expect, test } from "@playwright/test";

test("R-MODE-05 preserving mode transitions retain the current scene and draft", async ({
  page,
}) => {
  await page.goto("/?fixture=low");
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect(page.getByText(/Paused.*1 galaxies.*500 stars/)).toBeVisible();
  await page.getByLabel("Name").fill("Preserved draft");
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByRole("main")).toHaveAttribute("data-mutation-pending", "false", {
    timeout: 30_000,
  });
  for (const mode of ["Collision", "Builder", "Random", "Collision", "Single"]) {
    await page.getByRole("tab", { name: mode }).click();
    await expect(page.getByRole("tab", { name: mode })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Name")).toHaveValue("Preserved draft");
    await expect(page.getByRole("img")).toHaveAttribute("aria-label", /1 galaxies/);
  }
});

test("R-HELP-01 help opens and closes without changing simulation", async ({ page }) => {
  await page.goto("/?fixture=low");
  await page.getByRole("button", { name: "Help" }).click();
  await expect(page.getByRole("dialog", { name: "Help" })).toBeVisible();
  await page.getByRole("button", { name: "Close help" }).click();
  await expect(page.getByRole("dialog", { name: "Help" })).toBeHidden();
  await expect(page.getByRole("img")).toHaveAttribute("aria-label", /1 galaxies/);
});
