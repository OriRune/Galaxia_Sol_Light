import { DEFAULT_SCENE_SETUP } from "../domain/defaults";
import { generateRandomScenario } from "../generation/randomScenarios";
import type { PerformanceLevel, RandomCategory, SceneSetup } from "../domain/types";
export interface PlaybackState {
  playing: boolean;
  selectedSpeed: 0.25 | 0.5 | 1 | 2 | 4;
}
export function setPlaying(state: PlaybackState, playing: boolean): PlaybackState {
  return { ...state, playing };
}
export function parseSeed(text: string): number | null {
  const value = text.trim();
  if (!/^[+-]?\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 0xffffffff ? number : null;
}
export function randomPlan(
  category: RandomCategory,
  seedText: string,
  level: PerformanceLevel,
  trails: boolean,
): { scene: SceneSetup; selection: null; automaticFraming: true; playing: true } | null {
  const seed = parseSeed(seedText);
  if (seed === null) return null;
  const engine = generateRandomScenario(category, seed, level);
  return {
    scene: { ...engine, performanceLevel: level, trails },
    selection: null,
    automaticFraming: true,
    playing: true,
  };
}
export function rerollSeed(
  current: number,
  cryptoSource: Pick<Crypto, "getRandomValues"> = crypto,
): number {
  const value = new Uint32Array(1);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    cryptoSource.getRandomValues(value);
    const next = value[0] ?? current;
    if (next !== current) return next;
  }
  return (current + 1) >>> 0;
}
export function performancePlan(scene: SceneSetup, level: PerformanceLevel): SceneSetup {
  return {
    ...scene,
    galaxies: scene.galaxies.map((record) => ({ ...record, generation: { ...record.generation } })),
    performanceLevel: level,
  };
}
export function regeneratePlan(scene: SceneSetup): { type: "REGENERATE_SCENE"; seeds: number[] } {
  return {
    type: "REGENERATE_SCENE",
    seeds: scene.galaxies.map((record) => record.generation.seed),
  };
}
export function startupScene(): SceneSetup {
  return structuredClone(DEFAULT_SCENE_SETUP);
}
