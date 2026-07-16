import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const firefoxPath = path.join(process.env.ProgramFiles ?? "", "Mozilla Firefox", "firefox.exe");
const port = Number(process.env.BENCHMARK_PORT ?? 4174);
const evidenceDirectory = path.resolve("docs/evidence");
const viteCli = path.resolve("node_modules/vite/bin/vite.js");
const preview = spawn(
  process.execPath,
  [viteCli, "preview", "--host", "127.0.0.1", "--port", String(port)],
  { stdio: "ignore", windowsHide: true },
);

async function delay(milliseconds) {
  await new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function waitForPreview() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (preview.exitCode !== null)
      throw new Error("Benchmark preview exited before owning the fixed port.");
    try {
      const response = await globalThis.fetch(`http://127.0.0.1:${String(port)}/`);
      if (response.ok) return;
    } catch {
      // The preview may still be binding its port.
    }
    await delay(100);
  }
  throw new Error("Benchmark preview did not start.");
}

async function createProfile() {
  const profile = await mkdtemp(path.join(os.tmpdir(), "galaxia-firefox-"));
  const preferences = [
    ["browser.download.folderList", 2],
    ["browser.download.dir", evidenceDirectory],
    ["browser.download.useDownloadDir", true],
    ["browser.download.alwaysOpenPanel", false],
    ["browser.helperApps.neverAsk.saveToDisk", "application/json,application/octet-stream"],
  ];
  await writeFile(
    path.join(profile, "user.js"),
    `${preferences.map(([name, value]) => `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`).join("\n")}\n`,
    "utf8",
  );
  return profile;
}

async function waitForDownload(before) {
  for (let attempt = 0; attempt < 1_500; attempt += 1) {
    const files = await readdir(evidenceDirectory);
    const downloaded = files.find(
      (file) =>
        !before.has(file) && file.startsWith("renderer-proxy-60000-") && file.endsWith(".json"),
    );
    if (downloaded) {
      const target = path.join(evidenceDirectory, downloaded);
      try {
        JSON.parse(await readFile(target, "utf8"));
        return target;
      } catch {
        // Firefox may have exposed the final name before completing the write.
      }
    }
    await delay(100);
  }
  throw new Error("System Firefox benchmark download timed out.");
}

async function terminate(browser, profile) {
  if (process.platform !== "win32") {
    if (browser.exitCode === null) browser.kill("SIGKILL");
    return;
  }
  const escapedProfile = profile.replaceAll("'", "''");
  const command = `Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" | Where-Object { $_.CommandLine -like '*${escapedProfile}*' } | ForEach-Object { taskkill /pid $_.ProcessId /t /f | Out-Null }`;
  const killer = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    stdio: "ignore",
    windowsHide: true,
  });
  await Promise.race([
    new Promise((resolve) => killer.once("exit", resolve)),
    delay(15_000).then(() => killer.kill()),
  ]);
  if (browser.exitCode === null) browser.kill();
  await delay(500);
}

function validateRun(run, index) {
  if (
    String(run.webgl?.renderer).includes("Software") ||
    String(run.webgl?.renderer).includes("SwiftShader")
  )
    throw new Error(`Firefox run ${String(index)} used software rendering.`);
  if (run.averageFps < 40 || run.p95FrameIntervalMs > 37.5 || run.p95VisibleResponseMs > 75)
    throw new Error(`Firefox run ${String(index)} failed the renderer timing gate.`);
  const five = run.trailSamples.find((sample) => sample.elapsedSeconds === 5);
  const sixty = run.trailSamples.find((sample) => sample.elapsedSeconds === 60);
  if (!five || !sixty || five.activeTexels < 100 || sixty.activeTexels < 100)
    throw new Error(`Firefox run ${String(index)} has an invalid trail fixture.`);
  if (sixty.p99Y / Math.max(sixty.medianY, 1 / 255) < 2)
    throw new Error(`Firefox run ${String(index)} failed trail contrast.`);
  if (sixty.standardDeviationY < five.standardDeviationY * 0.5)
    throw new Error(`Firefox run ${String(index)} failed trail retention.`);
}

const envelopes = [];
try {
  await waitForPreview();
  for (let index = 1; index <= 3; index += 1) {
    const before = new Set(await readdir(evidenceDirectory));
    const profile = await createProfile();
    const url = `http://127.0.0.1:${String(port)}/?harness=performance&driver=31.0.137.0&particles=60000&warmupMs=5000&measurementMs=60000&runs=1&autorun=1`;
    const browser = spawn(
      firefoxPath,
      ["-no-remote", "-new-instance", "-profile", profile, "-kiosk", url],
      {
        stdio: "ignore",
        windowsHide: true,
      },
    );
    let downloaded;
    try {
      downloaded = await waitForDownload(before);
      const envelope = JSON.parse(await readFile(downloaded, "utf8"));
      if (
        !envelope.qualifyingSurface ||
        !Array.isArray(envelope.results) ||
        envelope.results.length !== 1
      )
        throw new Error(`Firefox run ${String(index)} did not use the qualifying surface.`);
      validateRun(envelope.results[0], index);
      envelopes.push(envelope);
      console.log(`System Firefox run ${String(index)} passed.`);
    } finally {
      await terminate(browser, profile);
      if (downloaded) await rm(downloaded, { force: true, maxRetries: 5, retryDelay: 100 });
      await rm(profile, { force: true, recursive: true, maxRetries: 3, retryDelay: 100 }).catch(
        () => undefined,
      );
    }
  }
  const first = envelopes[0];
  const combined = {
    ...first,
    recordedAt: new Date().toISOString(),
    pageUrl: String(first.pageUrl).replace("runs=1", "runs=3-fresh-instances"),
    results: envelopes.map((envelope) => envelope.results[0]),
  };
  await writeFile(
    path.join(
      evidenceDirectory,
      port === 4174
        ? "renderer-proxy-system-firefox.json"
        : "renderer-proxy-system-firefox-diagnostic.json",
    ),
    `${JSON.stringify(combined, null, 2)}\n`,
    "utf8",
  );
  console.log("System Firefox renderer gate passed and evidence was saved.");
} finally {
  preview.kill();
}
