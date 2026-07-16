import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const firefox = path.join(process.env.ProgramFiles ?? "", "Mozilla Firefox", "firefox.exe"),
  port = 4174,
  evidence = path.resolve("docs/evidence"),
  fixtures = [
    ["low", 10_000],
    ["balanced", 30_000],
    ["high", 60_000],
  ],
  preview = spawn(
    process.execPath,
    [
      path.resolve("node_modules/vite/bin/vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { stdio: "ignore", windowsHide: true },
  );

const delay = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));
async function ready() {
  for (let index = 0; index < 100; index += 1) {
    try {
      if ((await globalThis.fetch(`http://127.0.0.1:${String(port)}/`)).ok) return;
    } catch {
      // Preview may still be binding.
    }
    await delay(100);
  }
  throw new Error("Preview failed.");
}
async function profile() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "galaxia-production-firefox-"));
  await writeFile(
    path.join(directory, "user.js"),
    `user_pref("browser.download.folderList",2);\nuser_pref("browser.download.dir",${JSON.stringify(evidence)});\nuser_pref("browser.download.useDownloadDir",true);\nuser_pref("browser.download.alwaysOpenPanel",false);\nuser_pref("browser.helperApps.neverAsk.saveToDisk","application/json");\n`,
  );
  return directory;
}
async function download(before, fixture, starCount) {
  for (let index = 0; index < 1_500; index += 1) {
    const name = (await readdir(evidence)).find(
      (file) =>
        !before.has(file) &&
        file.startsWith(`production-${fixture}-${String(starCount)}-`) &&
        file.endsWith(".json"),
    );
    if (name) {
      const target = path.join(evidence, name);
      try {
        return { target, value: JSON.parse(await readFile(target, "utf8")) };
      } catch {
        // Firefox may expose the name before the write is complete.
      }
    }
    await delay(100);
  }
  throw new Error(`Production Firefox ${fixture} download timed out.`);
}
async function terminate(browser, directory) {
  const escaped = directory.replaceAll("'", "''"),
    killer = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" | Where-Object { $_.CommandLine -like '*${escaped}*' } | ForEach-Object { taskkill /pid $_.ProcessId /t /f | Out-Null }`,
      ],
      { stdio: "ignore", windowsHide: true },
    );
  await Promise.race([new Promise((resolve) => killer.once("exit", resolve)), delay(15_000)]);
  if (browser.exitCode === null) browser.kill();
}

try {
  await ready();
  for (const [fixture, starCount] of fixtures) {
    const before = new Set(await readdir(evidence)),
      directory = await profile(),
      browser = spawn(
        firefox,
        [
          "-no-remote",
          "-new-instance",
          "-profile",
          directory,
          "-kiosk",
          `http://127.0.0.1:${String(port)}/?harness=performance&production=1&fixture=${fixture}&driver=31.0.137.0&particles=${String(starCount)}&warmupMs=5000&measurementMs=60000&runs=1&autorun=1`,
        ],
        { stdio: "ignore", windowsHide: true },
      );
    let temporary;
    try {
      const loaded = await download(before, fixture, starCount);
      temporary = loaded.target;
      const result = loaded.value.results?.[0];
      if (
        !result ||
        result.starCount !== starCount ||
        result.averageFps < 30 ||
        result.p95FrameMs > 50 ||
        result.p95ResponseMs > 100
      )
        throw new Error(`System Firefox production ${fixture} gate failed.`);
      await writeFile(
        path.join(evidence, `production-${fixture}-system-firefox.json`),
        `${JSON.stringify(loaded.value, null, 2)}\n`,
      );
      console.log(
        `System Firefox ${fixture} passed: ${result.averageFps.toFixed(2)} FPS, ${result.p95FrameMs.toFixed(2)} ms frame p95, ${result.p95ResponseMs.toFixed(2)} ms response p95.`,
      );
    } finally {
      await terminate(browser, directory);
      if (temporary) await rm(temporary, { force: true });
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(
        () => undefined,
      );
    }
  }
} finally {
  preview.kill();
}
