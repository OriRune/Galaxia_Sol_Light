/* eslint-disable @typescript-eslint/no-non-null-assertion -- Array.from only yields non-empty characters. */
import { MAX_NAME_CODE_POINTS } from "./ranges";

export function validateProductName(value: unknown) {
  if (typeof value !== "string") throw new TypeError("Name must be a string.");
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new RangeError("Name must not be empty.");
  if (Array.from(trimmed).length > MAX_NAME_CODE_POINTS) {
    throw new RangeError(`Name must contain at most ${String(MAX_NAME_CODE_POINTS)} code points.`);
  }
  return trimmed;
}

export function normalizedName(value: string) {
  return validateProductName(value).normalize("NFC").toLowerCase();
}

export function uniqueLibraryName(desired: string, usedNormalized: ReadonlySet<string>): string {
  const base = validateProductName(desired);
  if (!usedNormalized.has(normalizedName(base))) return base;
  for (let number = 2; Number.isSafeInteger(number); number += 1) {
    const suffix = ` (${String(number)})`,
      available = MAX_NAME_CODE_POINTS - Array.from(suffix).length,
      candidate = `${Array.from(base).slice(0, available).join("")}${suffix}`;
    if (!usedNormalized.has(normalizedName(candidate))) return candidate;
  }
  throw new Error("Unable to allocate a unique name.");
}

export function defaultLibraryName(kind: "Preset" | "Scene" | "Capture" | "Recording", date: Date) {
  const timestamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, " UTC")
    .replace("T", " ")
    .replaceAll(":", "-");
  return `${kind} ${timestamp}`;
}

const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\.|$)/i;
export function exportBaseName(value: string): string {
  let result = Array.from(value, (character) => {
    const code = character.codePointAt(0)!;
    return code <= 31 || code === 127 ? "_" : character;
  })
    .join("")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  if (WINDOWS_RESERVED.test(result)) result = `_${result}`;
  return result || "galaxia";
}

export function boundedExportName(base: string, extension: string): string {
  const points = Array.from(exportBaseName(base)),
    encoder = new TextEncoder();
  while (points.length > 0 && encoder.encode(`${points.join("")}${extension}`).byteLength > 200)
    points.pop();
  const bounded = points.join("") || "galaxia";
  return `${bounded}${extension}`;
}
