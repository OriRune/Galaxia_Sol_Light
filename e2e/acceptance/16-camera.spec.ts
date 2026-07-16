import { expect, test } from "@playwright/test";

test("R-CAM-02 manual zoom disables automatic framing until explicitly enabled", async ({
  page,
}) => {
  await page.goto("/?fixture=low");
  const autoFrame = page.getByLabel("Auto-frame");
  await expect(autoFrame).toBeChecked();
  const viewport = page.getByRole("img");
  await viewport.dispatchEvent("wheel", { deltaY: -120 });
  await expect(autoFrame).not.toBeChecked();
  await page.getByRole("button", { name: "Reset camera" }).click();
  await expect(autoFrame).not.toBeChecked();
  await autoFrame.check();
  await expect(autoFrame).toBeChecked();
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect(page.getByText(/Paused.*1 galaxies.*500 stars/)).toBeVisible();
  const bounds = await viewport.boundingBox();
  if (!bounds) throw new Error("Viewport bounds unavailable.");
  await page.getByRole("list", { name: "Scene galaxies" }).getByRole("button").click();
  await expect(page.getByRole("region", { name: "Selected galaxy configuration" })).toBeVisible();
  const ring = page.locator(".selected-core-ring"),
    cx = Number(await ring.getAttribute("cx")),
    cy = Number(await ring.getAttribute("cy")),
    center = { x: bounds.x + cx, y: bounds.y + cy };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 30, center.y, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByRole("main")).toHaveAttribute("data-mutation-pending", "false", {
    timeout: 30_000,
  });
  await expect(page.getByLabel("Position X")).not.toHaveValue("0");
  await page.getByLabel("Velocity X").fill("5");
  await page.getByLabel("Velocity X").press("Enter");
  await expect(page.getByRole("main")).toHaveAttribute("data-mutation-pending", "false", {
    timeout: 30_000,
  });
  await expect(page.getByLabel("Velocity X")).toHaveValue("5");
  const handle = page.locator(".velocity-handle");
  await expect(handle).toBeVisible();
  const hx = Number(await handle.getAttribute("cx")),
    hy = Number(await handle.getAttribute("cy"));
  await page.mouse.move(bounds.x + hx, bounds.y + hy);
  await page.mouse.down();
  await page.mouse.move(bounds.x + hx + 20, bounds.y + hy, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByRole("main")).toHaveAttribute("data-mutation-pending", "false", {
    timeout: 30_000,
  });
  await expect(page.getByLabel("Velocity X")).not.toHaveValue("5");
});
