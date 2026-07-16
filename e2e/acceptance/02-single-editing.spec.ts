import { expect, test } from "@playwright/test";

test("R-EDIT-01 Single draft edits commit one regenerated galaxy", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?fixture=low");
  await expect(page.getByRole("button", { name: "Play/Pause" })).toBeEnabled({ timeout: 30_000 });
  for (const [label, value, depth] of [
    ["Seed", "42", "1"],
    ["Size", "55", "2"],
    ["Mass", "30", "3"],
    ["Name", "Edited galaxy", "4"],
  ] as const) {
    await page.getByLabel(label).fill(value);
    await page.getByLabel(label).press("Enter");
    await expect(page.getByRole("main")).toHaveAttribute("data-undo-depth", depth, {
      timeout: 30_000,
    });
  }
  await expect(page.getByLabel("Seed")).toHaveValue("42");
  await expect(page.getByLabel("Name")).toHaveValue("Edited galaxy");
  await expect(page.getByRole("img")).toHaveAttribute("aria-label", /1 galaxies/);
});

test("R-VALID-01 invalid seed input is non-destructive", async ({ page }) => {
  await page.goto("/?fixture=low");
  await page.getByLabel("Seed").fill("-1");
  await page.getByLabel("Seed").press("Enter");
  await expect(page.getByLabel("Seed")).toHaveValue("-1");
  await expect(page.getByLabel("Seed")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Seed").press("Escape");
  await expect(page.getByLabel("Seed")).toHaveValue("1");
});
