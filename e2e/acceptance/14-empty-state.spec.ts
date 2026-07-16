import { expect, test } from "@playwright/test";

test("R-MODE-04 Builder supports a stable empty scene and adding from zero", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?fixture=low");
  await expect(page.getByRole("tab", { name: "Builder" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect(page.getByLabel("Gravity")).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Builder" }).click();
  await page
    .getByRole("list", { name: "Scene galaxies" })
    .getByRole("button", {
      name: "First Light",
    })
    .click();
  await expect(page.getByRole("button", { name: "Delete selected galaxy" })).toBeEnabled();
  await page.getByRole("button", { name: "Delete selected galaxy" }).click();
  await expect(page.getByRole("img")).toHaveAttribute("aria-label", /0 galaxies, 0 stars/, {
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Add galaxy" })).toBeEnabled();
  await page.getByRole("tab", { name: "Scenes" }).click();
  await expect(page.getByRole("button", { name: "Save scene" })).toBeEnabled();
  await page.getByLabel("Star count").fill("500");
  await page.getByRole("button", { name: "Add galaxy" }).click();
  await expect(page.getByRole("img")).toHaveAttribute("aria-label", /1 galaxies, 500 stars/, {
    timeout: 30_000,
  });
});
