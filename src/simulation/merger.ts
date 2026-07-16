/* eslint-disable @typescript-eslint/no-non-null-assertion -- Validated records and banks share bounded indices. */
import { coreRadius } from "../domain/derived";
import type { GalaxyRecord } from "../domain/types";
import { float64Words, GALAXY_TYPE_CODES, hashWords, HASH_DOMAINS } from "../generation/hashWords";
import { MERGER_SPEED_THRESHOLD } from "./constants";
import type { StateBank } from "./engine";

export interface MergerPair {
  first: number;
  second: number;
  ordinal: number;
}

function configHash(record: GalaxyRecord) {
  const generation = record.generation;
  return hashWords(HASH_DOMAINS.mergerConfig, [
    GALAXY_TYPE_CODES[generation.type],
    generation.seed,
    generation.starCount,
    ...float64Words(generation.size),
    ...float64Words(generation.mass),
    ...float64Words(generation.spin),
    generation.armCount ?? 0,
    generation.blackHole ? 1 : 0,
  ]);
}

export function eligibleMergerPairs(records: readonly GalaxyRecord[], bank: StateBank) {
  const used = new Set<number>();
  const pairs: MergerPair[] = [];
  for (let first = 0; first < records.length; first += 1) {
    for (let second = first + 1; second < records.length; second += 1) {
      if (used.has(first) || used.has(second)) continue;
      const firstRecord = records[first];
      const secondRecord = records[second];
      if (!firstRecord || !secondRecord) throw new Error("INVALID_SIMULATION_STATE");
      const separation = Math.hypot(
        bank.coreX[second]! - bank.coreX[first]!,
        bank.coreY[second]! - bank.coreY[first]!,
      );
      const speed = Math.hypot(
        bank.coreVx[second]! - bank.coreVx[first]!,
        bank.coreVy[second]! - bank.coreVy[first]!,
      );
      if (
        separation <=
          coreRadius(firstRecord.generation.size) + coreRadius(secondRecord.generation.size) &&
        speed <= MERGER_SPEED_THRESHOLD
      ) {
        pairs.push({ first, second, ordinal: pairs.length });
        used.add(first);
        used.add(second);
      }
    }
  }
  return pairs;
}

export function createRemnantRecord(
  first: GalaxyRecord,
  second: GalaxyRecord,
  bank: StateBank,
  firstIndex: number,
  secondIndex: number,
  stepIndex: number,
  pairOrdinal: number,
  occupiedIds: Set<string>,
) {
  const mass = first.generation.mass + second.generation.mass;
  const seed = hashWords(HASH_DOMAINS.mergerSeed, [configHash(first), configHash(second)]);
  const baseId = `m-${String(stepIndex)}-${seed.toString(16).padStart(8, "0")}-${String(pairOrdinal)}`;
  let id = baseId;
  for (let suffix = 2; occupiedIds.has(id); suffix += 1) id = `${baseId}-${String(suffix)}`;
  occupiedIds.add(id);
  const singleName = first.name ?? second.name;
  const combinedName =
    first.name !== null && second.name !== null
      ? `${first.name} + ${second.name}`
      : singleName !== null
        ? `${singleName} Remnant`
        : null;
  return {
    id,
    generation: {
      type: "elliptical",
      seed,
      starCount: first.generation.starCount + second.generation.starCount,
      size: Math.min(
        100,
        Math.sqrt(
          first.generation.size * first.generation.size +
            second.generation.size * second.generation.size,
        ),
      ),
      mass,
      spin: Math.min(
        2,
        Math.max(
          -2,
          (first.generation.mass * first.generation.spin +
            second.generation.mass * second.generation.spin) /
            mass,
        ),
      ),
      armCount: null,
      blackHole: first.generation.blackHole || second.generation.blackHole,
    },
    name: combinedName === null ? null : Array.from(combinedName).slice(0, 80).join(""),
    position: {
      x:
        (first.generation.mass * bank.coreX[firstIndex]! +
          second.generation.mass * bank.coreX[secondIndex]!) /
        mass,
      y:
        (first.generation.mass * bank.coreY[firstIndex]! +
          second.generation.mass * bank.coreY[secondIndex]!) /
        mass,
    },
    bulkVelocity: {
      x:
        (first.generation.mass * bank.coreVx[firstIndex]! +
          second.generation.mass * bank.coreVx[secondIndex]!) /
        mass,
      y:
        (first.generation.mass * bank.coreVy[firstIndex]! +
          second.generation.mass * bank.coreVy[secondIndex]!) /
        mass,
    },
  } satisfies GalaxyRecord;
}
