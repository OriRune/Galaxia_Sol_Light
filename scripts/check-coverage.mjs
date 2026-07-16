import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const coverageGroups = [
  { name: "domain", match: "/src/domain/", floor: 90, pending: true },
  { name: "generation", match: "/src/generation/", floor: 90, pending: true },
  { name: "simulation", match: "/src/simulation/", floor: 90, pending: true },
  { name: "overall", match: "/src/", floor: 80, pending: false },
];

function counts(report, files, kind) {
  let hit = 0;
  let total = 0;
  for (const file of files) {
    const data = report[file];
    const map = kind === "statement" ? data.s : kind === "function" ? data.f : data.b;
    for (const value of Object.values(map)) {
      const values = Array.isArray(value) ? value : [value];
      total += values.length;
      hit += values.filter((entry) => entry > 0).length;
    }
  }
  return { hit, total };
}

export function evaluateCoverage(report, requiredGroups = new Set()) {
  const rows = [];
  let failed = false;
  for (const group of coverageGroups) {
    const files = Object.keys(report).filter((file) =>
      file.replaceAll("\\", "/").includes(group.match),
    );
    const mayBePending = group.pending && !requiredGroups.has(group.name);
    if (files.length === 0 && mayBePending) {
      rows.push(`${group.name}: pending`);
      continue;
    }
    if (files.length === 0) {
      rows.push(`${group.name}: empty`);
      failed = true;
      continue;
    }
    for (const kind of ["statement", "branch", "function"]) {
      const { hit, total } = counts(report, files, kind);
      const actual = total === 0 ? 100 : (hit / total) * 100;
      rows.push(`${group.name} ${kind}: ${actual.toFixed(2)}%`);
      if (actual < group.floor) failed = true;
    }
  }
  return { failed, rows };
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath) throw new Error("Usage: check-coverage.mjs <coverage-final.json>");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const required = new Set([
    "simulation",
    ...(process.env.COVERAGE_REQUIRED_GROUPS ?? "").split(",").filter(Boolean),
  ]);
  const result = evaluateCoverage(report, required);
  for (const row of result.rows) console.log(row);
  if (result.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
