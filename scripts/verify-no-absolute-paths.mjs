import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const roots = ["src", "scripts", "tests", "e2e", "perf"];
const rootFiles = [
  "package.json",
  "vite.config.ts",
  "vitest.config.ts",
  "playwright.config.ts",
  "eslint.config.js",
  "dependency-cruiser.cjs",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.worker.json",
  "tsconfig.node.json",
  "tsconfig.eslint.json",
  ".prettierrc.json",
];
const pathPatterns = {
  windowsDrive: /(?:^|[\s"'(])[A-Za-z]:[\\/]/m,
  windowsUnc: /(?:^|[\s"'])\\\\[^\\\s]+\\[^\\\s]+/m,
  posixHome: /(?:^|[\s"'])\/(?:home|Users)\/[^\s"']+/m,
};

export function findAbsolutePathKinds(text) {
  return Object.entries(pathPatterns)
    .filter(([, pattern]) => pattern.test(text))
    .map(([kind]) => kind);
}

async function collect(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => {
        const item = path.join(directory, entry.name);
        return entry.isDirectory() ? collect(item) : [item];
      }),
    );
    return nested.flat();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function findFilesWithAbsolutePaths() {
  const files = [...(await Promise.all(roots.map(collect))).flat(), ...rootFiles];
  const violations = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (findAbsolutePathKinds(text).length > 0) violations.push(file);
  }
  return violations;
}

async function main() {
  const violations = await findFilesWithAbsolutePaths();
  if (violations.length > 0) {
    console.error(`Absolute filesystem paths found:\n${violations.join("\n")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
