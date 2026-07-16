import { expect, test } from "@playwright/test";

test("R-CAP-01 and R-REC-01 capture artwork and duration-finalize 300 slots", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/?fixture=low");
  const screenshot = page.getByRole("button", { name: "Screenshot" });
  await expect(screenshot).toBeEnabled({ timeout: 30_000 });
  await screenshot.click();
  await expect(page.getByRole("status").filter({ hasText: "Screenshot saved" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("tab", { name: "Captures" }).click();
  await expect(
    page.getByRole("list", { name: "Saved captures" }).getByRole("listitem"),
  ).toHaveCount(1);
  await page.getByLabel("Recording seconds").fill("10");
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByRole("button", { name: "Record", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("status").filter({ hasText: "Recording saved" })).toBeVisible();
  await page.getByRole("tab", { name: "Recordings" }).click();
  const stored = await page.evaluate(async () => {
    const open = (name: string) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(request.error ?? new Error("IndexedDB open failed."));
        };
      });
    const library = await open("galaxia-library"),
      frames = await open("galaxia-recording-frames");
    const recording = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = library.transaction("recordings").objectStore("recordings").getAll();
      request.onsuccess = () => {
        resolve(request.result[0] as Record<string, unknown>);
      };
      request.onerror = () => {
        reject(request.error ?? new Error("Recording read failed."));
      };
    });
    const frameCount = await new Promise<number>((resolve, reject) => {
      const request = frames.transaction("frames").objectStore("frames").count();
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error("Frame count failed."));
      };
    });
    library.close();
    frames.close();
    return { recording, frameCount };
  });
  expect(stored.recording).toMatchObject({
    state: "complete",
    terminalReason: "duration",
    nominalSlots: 300,
    effectiveSlotLimit: 300,
  });
  expect(stored.frameCount).toBeGreaterThan(0);
});
