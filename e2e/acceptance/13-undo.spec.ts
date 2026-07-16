import { expect, test } from "@playwright/test";

test("R-UNDO-01 consecutive undo restores exact prior global states", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?fixture=low");
  await expect(page.getByRole("button", { name: "Play/Pause" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect(page.locator(".top-bar span").filter({ hasText: "Paused" })).toBeVisible();
  await expect(page.getByLabel("Gravity")).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Gravity").fill("2");
  await page.getByLabel("Gravity").press("Enter");
  await expect(page.getByRole("main")).toHaveAttribute("data-undo-depth", "1", {
    timeout: 30_000,
  });
  await page.getByLabel("Speed").selectOption("0.5");
  await expect(page.getByLabel("Speed")).toHaveValue("0.5");
  await expect(page.getByRole("main")).toHaveAttribute("data-undo-depth", "2");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Speed")).toHaveValue("1", { timeout: 30_000 });
  await expect(page.getByRole("main")).toHaveAttribute("data-undo-depth", "1");
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await expect(page.getByLabel("Gravity")).toHaveValue("2");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("main")).toHaveAttribute("data-undo-depth", "0", {
    timeout: 30_000,
  });
  await expect(page.getByLabel("Gravity")).toHaveValue("1", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});
