import type {
  GalaxyGenerationConfig,
  GalaxyType,
  PerformanceLevel,
  RandomCategory,
} from "../domain/types";
import { mix32 } from "./mix32";

export const HASH_DOMAINS = Object.freeze({
  position: 0x504f534e,
  velocity: 0x56454c4f,
  style: 0x5354594c,
  variation: 0x47414c58,
  randomScenario: 0x53434e45,
  randomChild: 0x4348494c,
  randomId: 0x4944454e,
  mergerConfig: 0x4d434647,
  mergerSeed: 0x4d455247,
});

export const GALAXY_TYPE_CODES: Readonly<Record<GalaxyType, number>> = Object.freeze({
  spiral: 0,
  barredSpiral: 1,
  elliptical: 2,
  irregular: 3,
  dwarf: 4,
});
export const PERFORMANCE_CODES: Readonly<Record<PerformanceLevel, number>> = Object.freeze({
  low: 0,
  balanced: 1,
  high: 2,
});
export const RANDOM_CATEGORY_CODES: Readonly<Record<RandomCategory, number>> = Object.freeze({
  single: 0,
  collision: 1,
  cluster: 2,
});

export function hashWords(domain: number, words: Iterable<number>) {
  let hash = mix32(((domain >>> 0) ^ 0x9e3779b9) >>> 0);
  for (const word of words) hash = mix32((hash ^ (word >>> 0)) >>> 0);
  return hash;
}

export function float64Words(value: number): [number, number] {
  if (!Number.isFinite(value)) throw new RangeError("Canonical number must be finite.");
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, Object.is(value, -0) ? 0 : value, true);
  return [view.getUint32(0, true), view.getUint32(4, true)];
}

export function canonicalGenerationWords(
  generation: Readonly<GalaxyGenerationConfig>,
  includeBlackHole: boolean,
) {
  const words = [
    GALAXY_TYPE_CODES[generation.type],
    generation.seed,
    generation.starCount,
    ...float64Words(generation.size),
    ...float64Words(generation.mass),
    ...float64Words(generation.spin),
    generation.armCount ?? 0,
  ];
  if (includeBlackHole) words.push(generation.blackHole ? 1 : 0);
  return words;
}
