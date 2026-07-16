import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("architecture gate fixture", () => {
  it("fails an illegal domain-to-app import", () => {
    const fixture = path.resolve("tests/architecture/fixtures/illegal-import");
    expect(() =>
      execFileSync(
        process.execPath,
        [
          path.resolve("node_modules/dependency-cruiser/bin/dependency-cruise.mjs"),
          "--config",
          "dependency-cruiser.cjs",
          "src",
        ],
        { cwd: fixture, stdio: "pipe" },
      ),
    ).toThrow();
  });
});
