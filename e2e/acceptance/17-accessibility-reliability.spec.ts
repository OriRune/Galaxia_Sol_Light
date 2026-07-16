/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/prefer-nullish-coalescing -- Browser-evaluated DOM/WebGL probes are intentionally self-contained. */
import { expect, test } from "@playwright/test";

test("R-STATUS-01 keyboard and screen-reader landmark/form smoke", async ({ page }) => {
  await page.goto("/?fixture=low");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Modes" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Playback" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Modes" }).getByRole("tab")).toHaveCount(4);
  await expect(page.getByRole("img")).toHaveAttribute(
    "aria-label",
    /galaxies.*stars.*playing.*single mode/i,
  );
  const unnamed = await page.locator("button,input,select,textarea").evaluateAll((controls) =>
    controls
      .filter((control) => {
        const element = control as HTMLInputElement;
        return !(
          element.labels?.length ||
          element.getAttribute("aria-label")?.trim() ||
          element.getAttribute("aria-labelledby")?.trim() ||
          element.textContent?.trim() ||
          element.title.trim()
        );
      })
      .map((control) => control.outerHTML),
  );
  expect(unnamed).toEqual([]);
  await expect(page.getByRole("button", { name: "Play/Pause" })).toBeEnabled({ timeout: 30_000 });

  const shortcut = (key: string) =>
    page.evaluate((value) => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }));
    }, key);
  await shortcut(" ");
  await expect(page.getByText(/Paused.*1 galaxies.*500 stars/)).toBeVisible();
  const autoFrame = page.getByLabel("Auto-frame");
  await shortcut("f");
  await expect(autoFrame).not.toBeChecked();
  await shortcut(".");
  await expect(page.getByText(/Paused.*1 galaxies.*500 stars/)).toBeVisible();

  const help = page.getByRole("button", { name: "Help" });
  await help.click();
  await expect(page.getByRole("dialog", { name: "Interaction help" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Interaction help" })).toBeHidden();
  await expect(help).toBeFocused();
});

test("R-RELY-02 WebGL context loss and restoration keep the shell usable", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/?fixture=low");
  await expect(page.getByText("Renderer: ready")).toBeVisible({ timeout: 30_000 });
  const supported = await page.locator("canvas").evaluate(async (canvas) => {
    const gl = canvas.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    const lost = new Promise<void>((resolve) =>
      canvas.addEventListener("webglcontextlost", () => resolve(), { once: true }),
    );
    extension.loseContext();
    await lost;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const restored = new Promise<void>((resolve) =>
      canvas.addEventListener("webglcontextrestored", () => resolve(), { once: true }),
    );
    extension.restoreContext();
    await restored;
    return true;
  });
  expect(supported).toBe(true);
  await expect(page.getByRole("heading", { name: "Galaxia" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Screenshot" })).toBeEnabled({ timeout: 30_000 });
});
