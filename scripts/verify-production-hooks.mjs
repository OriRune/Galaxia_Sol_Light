import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const assets = path.resolve("dist/assets");
const files = (await readdir(assets)).filter((file) => file.endsWith(".js"));
const javascript = (
  await Promise.all(files.map((file) => readFile(path.join(assets, file), "utf8")))
).join("\n");
const forbidden = ["RendererHarness", "benchmark-surface", "VITE_TEST_HOOKS", "fixture=low"];
const present = forbidden.filter((token) => javascript.includes(token));
if (present.length > 0) throw new Error(`Production test hooks remain: ${present.join(", ")}`);
console.log("Production bundle contains no fixture-loading or fault-injection API.");
