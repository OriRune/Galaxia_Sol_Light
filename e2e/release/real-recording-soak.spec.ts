/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/prefer-promise-reject-errors -- IndexedDB request callbacks expose nullable DOMException reasons. */
import { expect, test } from "@playwright/test";

test("R-REC-01 full 120-second High-fixture real recording soak", async ({ page }) => {
  test.setTimeout(210_000);
  await page.goto("/?fixture=high");
  await expect(page.getByText(/Playing.*5 galaxies.*60000 stars/)).toBeVisible({ timeout: 45_000 });
  const record = page.getByRole("button", { name: "Record", exact: true });
  await expect(record).toBeEnabled({ timeout: 45_000 });
  await page.getByLabel("Recording seconds").fill("120");
  await record.click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await expect(record).toBeVisible({ timeout: 150_000 });
  await expect(page.locator(".viewport-message")).toContainText("Recording saved");
  const result = await page.evaluate(async () => {
    const request = indexedDB.open("galaxia-library");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const query = database.transaction("recordings").objectStore("recordings").getAll();
      query.onsuccess = () => resolve(query.result[0] as Record<string, unknown>);
      query.onerror = () => reject(query.error);
    });
    database.close();
    return row;
  });
  expect(result).toMatchObject({
    state: "complete",
    terminalReason: "duration",
    nominalSlots: 3600,
    effectiveSlotLimit: 3600,
  });
});
