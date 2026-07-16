import { expect, test } from "@playwright/test";

test("R-HIST-02 rewind enters restricted history, exits present, and resumes a branch", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/?fixture=low");
  await expect(page.getByText("Simulation: ready")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect(page.locator(".top-bar span").filter({ hasText: "Paused" })).toBeVisible();
  await expect(page.getByLabel("Gravity")).toBeEnabled({ timeout: 30_000 });
  const stepButton = page.getByRole("button", { name: "Step" });
  await expect(stepButton).toBeEnabled({ timeout: 30_000 });
  await stepButton.click();
  const slider = page.getByRole("slider", { name: "History position" });
  await expect(slider).toBeVisible({ timeout: 30_000 });
  for (let step = 0; step < 3; step += 1) {
    await expect(stepButton).toBeEnabled({ timeout: 30_000 });
    const before = Number(await slider.getAttribute("max"));
    await stepButton.click();
    await expect
      .poll(async () => Number(await slider.getAttribute("max")), { timeout: 30_000 })
      .toBeGreaterThan(before);
  }
  await slider.fill("0");
  await expect(page.getByRole("button", { name: "Resume here" })).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "Single" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Record" })).toBeDisabled();
  await page.getByRole("button", { name: "Exit to present" }).click();
  await expect(page.getByText(/Paused/)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Single" })).toBeEnabled();
  await slider.fill("0");
  await expect(page.getByRole("button", { name: "Resume here" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Resume here" }).click();
  await expect(page.getByText(/Playing/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume here" })).toBeDisabled();
});
