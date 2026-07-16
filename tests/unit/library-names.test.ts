import { describe, expect, it } from "vitest";
import {
  boundedExportName,
  defaultLibraryName,
  exportBaseName,
  normalizedName,
  uniqueLibraryName,
} from "../../src/domain/names";

describe("library naming", () => {
  it("suffixes without exceeding eighty Unicode code points", () => {
    const base = "😀".repeat(80),
      used = new Set([normalizedName(base)]),
      result = uniqueLibraryName(base, used);
    expect(Array.from(result)).toHaveLength(80);
    expect(result.endsWith(" (2)")).toBe(true);
  });
  it("uses the exact UTC default form", () => {
    expect(defaultLibraryName("Scene", new Date("2026-07-15T12:34:56.789Z"))).toBe(
      "Scene 2026-07-15 12-34-56 UTC",
    );
  });
  it.each(["CON", "con.txt", "PRN", "AUX", "NUL", "CLOCK$", "COM1", "LPT9"])(
    "protects reserved Windows base %s",
    (name) => {
      expect(exportBaseName(name).startsWith("_")).toBe(true);
    },
  );
  it("replaces every invalid filename character and stays within 200 UTF-8 bytes", () => {
    expect(exportBaseName('<a>:"b"/c\\d|e?f*')).toBe("_a___b__c_d_e_f_");
    const filename = boundedExportName("😀".repeat(100), ".galaxia-scene.json");
    expect(new TextEncoder().encode(filename).byteLength).toBeLessThanOrEqual(200);
    expect(exportBaseName("...   ")).toBe("galaxia");
    expect(boundedExportName("name", `.${"x".repeat(201)}`)).toMatch(/^galaxia\./);
  });
});
