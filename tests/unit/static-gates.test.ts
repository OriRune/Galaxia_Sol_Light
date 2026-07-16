import { describe, expect, it } from "vitest";
import { evaluateCoverage } from "../../scripts/check-coverage.mjs";
import { findAbsolutePathKinds } from "../../scripts/verify-no-absolute-paths.mjs";

const coveredFile = (hits: number[]) => ({
  s: { 0: hits[0] ?? 0 },
  b: { 0: hits },
  f: { 0: hits[0] ?? 0 },
});

describe("absolute path gate", () => {
  it.each([
    ["Windows drive", 'const p = "' + "C" + ':\\work\\file.ts"', "windowsDrive"],
    ["Windows UNC", 'const p = "' + "\\\\server" + '\\share\\file.ts"', "windowsUnc"],
    ["Linux home", 'const p = "' + "/home" + '/person/file.ts"', "posixHome"],
    ["macOS home", 'const p = "' + "/Users" + '/person/file.ts"', "posixHome"],
  ])("rejects %s paths", (_label, source, kind) => {
    expect(findAbsolutePathKinds(source)).toContain(kind);
  });

  it("allows a root-relative web URL", () => {
    expect(findAbsolutePathKinds('fetch("/assets/stars.bin")')).toEqual([]);
  });
});

describe("coverage gate", () => {
  it("passes covered source and reports unopened groups pending", () => {
    const result = evaluateCoverage({ "/repo/src/app/a.ts": coveredFile([1]) });
    expect(result.failed).toBe(false);
    expect(result.rows).toContain("domain: pending");
  });

  it("fails a metric below its floor", () => {
    const result = evaluateCoverage({ "/repo/src/app/a.ts": coveredFile([0]) });
    expect(result.failed).toBe(true);
  });

  it("fails an empty group after it becomes required", () => {
    const result = evaluateCoverage(
      { "/repo/src/app/a.ts": coveredFile([1]) },
      new Set(["domain"]),
    );
    expect(result.failed).toBe(true);
    expect(result.rows).toContain("domain: empty");
  });

  it("never allows overall source to be empty", () => {
    expect(evaluateCoverage({}).failed).toBe(true);
  });
});
