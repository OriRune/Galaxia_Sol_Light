import { expect, test } from "@playwright/test";

test("hosted startup, Worker, persistence, capture, recording, and rediscovery", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Galaxia" })).toBeVisible();
  await expect(page.getByText("Simulation: ready")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Renderer: ready")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Playing.*1 galaxies.*30000 stars/)).toBeVisible({ timeout: 45_000 });
  const playback = page.getByRole("button", { name: "Play/Pause" });
  await playback.click();
  await expect(page.getByText(/Paused.*1 galaxies.*30000 stars/)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByLabel("Gravity")).toBeEnabled({ timeout: 45_000 });
  await page.getByRole("tab", { name: "Presets" }).click();
  await page.getByRole("button", { name: "Save preset" }).click();
  await expect(
    page.getByRole("list", { name: "Saved presets" }).getByText("First Light", { exact: true }),
  ).toBeVisible();
  const presetDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("list", { name: "Saved presets" })
    .getByRole("button", { name: "Export preset" })
    .click();
  const presetDownload = await presetDownloadPromise,
    presetPath = await presetDownload.path();
  expect(presetDownload.suggestedFilename()).toBe("First Light.galaxia-preset.json");
  if (!presetPath) throw new Error("Preset export did not produce a local download.");
  await page.getByLabel("Import preset").setInputFiles(presetPath);
  await expect(page.locator(".viewport-message")).toHaveText(
    "Imported preset as First Light (2).",
    {
      timeout: 45_000,
    },
  );
  await expect(page.getByRole("list", { name: "Saved presets" }).getByRole("listitem")).toHaveCount(
    7,
  );
  await page.getByRole("tab", { name: "Scenes" }).click();
  await page.getByRole("button", { name: "Save scene" }).click();
  const savedScene = page.getByRole("list", { name: "Saved scenes" }).getByRole("listitem");
  await expect(savedScene).toHaveCount(1, { timeout: 45_000 });
  const sceneDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("list", { name: "Saved scenes" })
    .getByRole("button", { name: "Export scene" })
    .click();
  const sceneDownload = await sceneDownloadPromise,
    scenePath = await sceneDownload.path();
  expect(sceneDownload.suggestedFilename()).toMatch(/^Scene .* UTC\.galaxia-scene\.json$/);
  if (!scenePath) throw new Error("Scene export did not produce a local download.");
  await page.getByLabel("Import scene").setInputFiles(scenePath);
  await expect(page.locator(".viewport-message")).toHaveText("Scene imported.");
  await page.getByRole("button", { name: "Screenshot" }).click();
  await expect(page.locator(".viewport-message")).toHaveText("Screenshot saved.");
  await page.getByRole("tab", { name: "Captures" }).click();
  const capture = page.getByRole("list", { name: "Saved captures" }).getByRole("button", {
    name: /^Capture /,
  });
  await capture.click();
  await expect(page.getByRole("region", { name: "Capture detail" })).toBeVisible();
  const captureDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download capture" }).click();
  expect((await captureDownloadPromise).suggestedFilename()).toMatch(/^Capture .* UTC\.png$/);
  await page.getByLabel("Recording seconds").fill("10");
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record", exact: true })).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole("tab", { name: "Recordings" }).click();
  const recording = page.getByRole("list", { name: "Saved recordings" }).getByRole("button");
  await expect(recording).toHaveCount(1);
  await recording.click();
  await expect(page.getByRole("region", { name: "Recording detail" })).toContainText(
    "300 nominal slots",
  );
  const zipDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export recording part 1" }).click();
  const zipDownload = await zipDownloadPromise;
  expect(zipDownload.suggestedFilename()).toMatch(/-part-001\.zip$/);
  await page.reload();
  await page.getByRole("tab", { name: "Presets" }).click();
  await expect(
    page.getByRole("list", { name: "Saved presets" }).getByText("First Light", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Scenes" }).click();
  await expect(page.getByRole("list", { name: "Saved scenes" }).getByRole("listitem")).toHaveCount(
    1,
  );
  await page.getByRole("tab", { name: "Captures" }).click();
  await expect(
    page.getByRole("list", { name: "Saved captures" }).getByRole("listitem"),
  ).toHaveCount(1);
  await page.getByRole("tab", { name: "Recordings" }).click();
  await expect(
    page.getByRole("list", { name: "Saved recordings" }).getByRole("listitem"),
  ).toHaveCount(1);
});

test("hosted security headers block remote fixtures while preserving local features", async ({
  page,
}) => {
  const response = await page.goto("/release/deep-path");
  expect(response?.ok()).toBe(true);
  const csp = response?.headers()["content-security-policy"];
  if (csp === undefined)
    test.skip(true, "Local Vite preview does not apply Vercel response headers.");
  expect(csp).toContain("worker-src 'self' blob:");
  expect(csp).toContain("img-src 'self' blob: data:");
  const violations: string[] = [];
  await page.exposeFunction("recordCspViolation", (blocked: string) => violations.push(blocked));
  await page.evaluate(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      void window.recordCspViolation(event.blockedURI);
    });
    const script = document.createElement("script");
    script.src = "https://example.com/blocked.js";
    document.head.append(script);
    const image = new Image();
    image.src = "https://example.com/blocked.png";
    document.body.append(image);
  });
  await expect.poll(() => violations.length).toBeGreaterThanOrEqual(2);
});

declare global {
  interface Window {
    recordCspViolation: (blocked: string) => Promise<void>;
  }
}
