import { expect, test } from "@playwright/test";

test("R-PRESET-01 saved preset restores its exact displayed generation configuration", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/?fixture=low");
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect(page.locator(".top-bar span").filter({ hasText: "Paused" })).toBeVisible();
  await page.getByRole("tab", { name: "Presets" }).click();
  const save = page.getByRole("button", { name: "Save preset" });
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await save.click();
  const saved = page.getByRole("list", { name: "Saved presets" }).getByText("First Light");
  await expect(saved).toBeVisible();
  const seed = page.getByLabel("Seed");
  await seed.fill("222");
  await seed.press("Enter");
  await expect(page.getByRole("main")).toHaveAttribute("data-undo-depth", "1", {
    timeout: 30_000,
  });
  await expect(seed).toHaveValue("222");
  await page
    .getByRole("list", { name: "Saved presets" })
    .getByRole("button", {
      name: "Load preset",
    })
    .click();
  await expect(page.getByRole("main")).toHaveAttribute("data-mutation-pending", "false", {
    timeout: 30_000,
  });
  await expect(seed).toHaveValue("1", { timeout: 30_000 });
  await expect(page.getByLabel("Name")).toHaveValue("First Light");
});
