import { expect, test } from "@playwright/test";

test("Galaxia shell loads", async ({ page }) => {
  await page.goto("/?fixture=low");
  await expect(page.getByRole("heading", { name: "Galaxia" })).toBeVisible();
  await expect(page.getByText("Simulation: ready")).toBeVisible();
  await expect(page.getByText("Renderer: ready")).toBeVisible();
  const renderer = await page.locator("canvas").evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) return "none";
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return context ? "webgl" : "none";
  });
  expect(renderer).toBe("webgl");
});

test("unsupported WebGL keeps the shell available", async ({ page }) => {
  await page.addInitScript(() => {
    // The original method is reapplied with the patched canvas as its receiver below.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (contextId, options) {
      if (contextId === "webgl" || contextId === "webgl2") return null;
      return original.call(this, contextId, options as never);
    } as typeof original;
  });
  await page.goto("/?fixture=low");
  await expect(page.getByRole("heading", { name: "Galaxia" })).toBeVisible();
  await expect(page.getByText("Renderer: unavailable")).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/WebGL|renderer/i);
});
