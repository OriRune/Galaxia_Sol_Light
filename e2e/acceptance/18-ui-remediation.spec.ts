import { expect, test, type Page } from "@playwright/test";

async function expectTopBarControlsDoNotOverlap(page: Page) {
  const intersections = await page.locator(".top-bar").evaluate((topBar) => {
    const controls = Array.from(
      topBar.querySelectorAll<HTMLElement>(
        "button:not([hidden]), input:not([hidden]), select:not([hidden])",
      ),
    ).filter((control) => {
      const style = getComputedStyle(control);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    return controls.flatMap((left, leftIndex) => {
      const a = left.getBoundingClientRect();
      return controls.slice(leftIndex + 1).flatMap((right) => {
        const b = right.getBoundingClientRect();
        const overlaps =
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return overlaps
          ? [
              {
                left: left.getAttribute("aria-label") ?? left.textContent,
                right: right.getAttribute("aria-label") ?? right.textContent,
              },
            ]
          : [];
      });
    });
  });
  expect(intersections).toEqual([]);
}

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`R-STATUS-01 top-bar controls remain distinct and mode-safe at ${String(viewport.width)} by ${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?fixture=low");
    await expect(page.getByRole("button", { name: "Play/Pause" })).toBeEnabled({ timeout: 30_000 });
    await expectTopBarControlsDoNotOverlap(page);

    for (const mode of ["Collision", "Builder", "Random", "Single"]) {
      const tab = page.getByRole("tab", { name: mode });
      await expect(tab).toBeEnabled({ timeout: 30_000 });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
      await expect(page.getByLabel("Gravity")).not.toBeFocused();
    }
  });
}

test("R-STATUS-01 scene totals and named selection stay coherent through add and delete", async ({
  page,
}) => {
  await page.goto("/?fixture=low");
  await expect(page.getByRole("button", { name: "Play/Pause" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await page.getByRole("tab", { name: "Builder" }).click();
  await page.getByLabel("Name").fill("Test Companion");
  await page.getByRole("button", { name: "Add galaxy" }).click();

  const summary = page.getByRole("img");
  await expect(summary).toHaveAttribute("aria-label", /2 galaxies, 1000 stars/);
  await expect(page.locator(".top-bar")).toContainText("Selected Test Companion");
  await expect(page.getByRole("list", { name: "Scene galaxies" })).toContainText("Test Companion");
  await expect(page.getByRole("heading", { name: "Test Companion" })).toBeVisible();

  await page.getByRole("button", { name: "Delete selected" }).click();
  await expect(summary).toHaveAttribute("aria-label", /1 galaxies, 500 stars/);
});
