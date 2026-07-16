import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium, firefox } from "playwright";

function command(file, args) {
  try {
    return execFileSync(file, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

async function inspectBrowser(name, browserType, launchOptions = {}) {
  const browser = await browserType.launch(launchOptions);
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const graphics = await page.evaluate(() => {
      const canvas = globalThis.document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return null;
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        vendor: debug
          ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL))
          : String(gl.getParameter(gl.VENDOR)),
        renderer: debug
          ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
          : String(gl.getParameter(gl.RENDERER)),
        version: String(gl.getParameter(gl.VERSION)),
      };
    });
    return {
      name,
      version: browser.version(),
      viewport: { width: 1920, height: 1080 },
      devicePixelRatio: await page.evaluate(() => globalThis.devicePixelRatio),
      webgl: graphics,
    };
  } finally {
    await browser.close();
  }
}

const npmCli = path.join(
  path.dirname(process.execPath),
  "node_modules",
  "npm",
  "bin",
  "npm-cli.js",
);
const lockBytes = await readFile("package-lock.json");
const browsers = [
  await inspectBrowser("Playwright Chromium", chromium),
  await inspectBrowser("Playwright Firefox", firefox),
];
if (process.platform === "win32")
  browsers.push(await inspectBrowser("Microsoft Edge", chromium, { channel: "msedge" }));

const report = {
  recordedAt: new Date().toISOString(),
  os: {
    platform: os.platform(),
    name: os.type(),
    version: os.version(),
    release: os.release(),
    architecture: os.arch(),
  },
  runtime: { node: process.version, npm: command(process.execPath, [npmCli, "--version"]) },
  dependencyLockSha256: createHash("sha256").update(lockBytes).digest("hex"),
  browsers,
  gitCommit: command("git", ["rev-parse", "HEAD"]),
};

const output = process.argv[2] ?? "docs/evidence/environment-local.json";
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Environment record written to ${output}`);
