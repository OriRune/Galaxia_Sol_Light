import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const port = 4180;
const preview = spawn(
  process.execPath,
  [
    path.resolve("node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    stdio: "ignore",
    windowsHide: true,
  },
);
const delay = (milliseconds) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await globalThis.fetch(`http://127.0.0.1:${String(port)}/`)).ok) break;
    } catch {
      // Preview may still be binding.
    }
    await delay(100);
  }
  const root = await globalThis.fetch(`http://127.0.0.1:${String(port)}/`);
  const deep = await globalThis.fetch(`http://127.0.0.1:${String(port)}/release/deep-path`);
  const rootHtml = await root.text();
  const deepHtml = await deep.text();
  if (!root.ok || !deep.ok || rootHtml !== deepHtml || !rootHtml.includes('id="root"'))
    throw new Error("Production SPA fallback failed.");
  const assets = await readdir("dist/assets");
  const worker = assets.find((file) => file.startsWith("worker-") && file.endsWith(".js"));
  if (!worker || (await readFile(path.join("dist/assets", worker), "utf8")).length === 0)
    throw new Error("Production Worker chunk is absent.");
  console.log("Production root, deep SPA fallback, and Worker chunk passed.");
} finally {
  preview.kill();
}
