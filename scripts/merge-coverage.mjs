import { mkdir, readFile, writeFile } from "node:fs/promises";
import coverage from "istanbul-lib-coverage";

const { createCoverageMap } = coverage;

const reportPaths = ["coverage/unit/coverage-final.json", "coverage/browser/coverage-final.json"];
const merged = createCoverageMap({});

for (const reportPath of reportPaths) {
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  merged.merge(report);
}

await mkdir("coverage", { recursive: true });
await writeFile("coverage/coverage-final.json", `${JSON.stringify(merged.toJSON())}\n`, "utf8");
