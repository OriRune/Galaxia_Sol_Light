import { expect, test } from "@playwright/test";

test("R-SCENE-01 scene round trip restores the closed persisted settings", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?fixture=low");
  await page.getByRole("tab", { name: "Scenes" }).click();
  await expect(page.getByRole("button", { name: "Save scene" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect(page.locator(".top-bar span").filter({ hasText: "Paused" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel("Gravity").fill("2");
  await page.getByLabel("Gravity").press("Enter");
  await expect(page.getByRole("main")).toHaveAttribute("data-mutation-pending", "false", {
    timeout: 30_000,
  });
  await page.getByLabel("Speed").selectOption("0.5");
  await expect(page.getByRole("main")).toHaveAttribute("data-mutation-pending", "false", {
    timeout: 30_000,
  });
  await page.getByLabel("Performance").selectOption("low");
  await expect(page.getByRole("main")).toHaveAttribute("data-mutation-pending", "false", {
    timeout: 30_000,
  });
  await page.getByLabel("Trails").click();
  await expect(page.getByLabel("Trails")).toBeChecked();
  await page.getByRole("button", { name: "Save scene" }).click();
  await expect(
    page.getByRole("list", { name: "Saved scenes" }).getByText(/^Scene .* UTC$/),
  ).toBeVisible();
  await page.getByLabel("Gravity").fill("1");
  await page.getByLabel("Gravity").press("Enter");
  await page.getByLabel("Performance").selectOption("high");
  await expect(page.getByRole("main")).toHaveAttribute("data-mutation-pending", "false", {
    timeout: 30_000,
  });
  await page.getByLabel("Trails").click();
  await expect(page.getByLabel("Trails")).not.toBeChecked();
  await page
    .getByRole("list", { name: "Saved scenes" })
    .getByRole("button", {
      name: "Load scene",
    })
    .click();
  await expect(page.getByRole("tab", { name: "Builder" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".top-bar span").filter({ hasText: "Paused" })).toBeVisible();
  await expect(page.getByLabel("Gravity")).toHaveValue("2");
  await expect(page.getByLabel("Speed")).toHaveValue("0.5");
  await expect(page.getByLabel("Performance")).toHaveValue("low");
  await expect(page.getByLabel("Trails")).toBeChecked();
});
