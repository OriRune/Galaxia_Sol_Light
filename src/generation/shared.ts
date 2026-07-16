/* eslint-disable @typescript-eslint/no-non-null-assertion -- Palette selection is bounded to fixed tables. */
import { ownerRadialAcceleration } from "../domain/physicsContract";
import type { GalaxyGenerationConfig, GalaxyType } from "../domain/types";
import { normalLike } from "./deterministicMath";
import { canonicalGenerationWords, GALAXY_TYPE_CODES, hashWords, HASH_DOMAINS } from "./hashWords";
import { Mulberry32 } from "./mulberry32";
import { cosTurn, sinTurn } from "./sineTable";

export interface GeneratedGalaxy {
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  red: Uint8Array;
  green: Uint8Array;
  blue: Uint8Array;
  alpha: Uint8Array;
  pointSize: Uint8Array;
}

export interface GenerationDiagnostics {
  positionDraws: number;
  positionJitterDraws: number;
  velocityDraws: number;
  styleDraws: number;
}

class CountedPrng {
  draws = 0;
  constructor(private readonly source: Mulberry32) {}
  nextFloat() {
    this.draws += 1;
    return this.source.nextFloat();
  }
}

export function allocateGeneratedGalaxy(starCount: number): GeneratedGalaxy {
  return {
    x: new Float32Array(starCount),
    y: new Float32Array(starCount),
    vx: new Float32Array(starCount),
    vy: new Float32Array(starCount),
    red: new Uint8Array(starCount),
    green: new Uint8Array(starCount),
    blue: new Uint8Array(starCount),
    alpha: new Uint8Array(starCount),
    pointSize: new Uint8Array(starCount),
  };
}

export function createGenerationStreams(generation: Readonly<GalaxyGenerationConfig>) {
  const positionSeed = hashWords(
    HASH_DOMAINS.position,
    canonicalGenerationWords(generation, false),
  );
  const velocitySeed = hashWords(
    HASH_DOMAINS.velocity,
    canonicalGenerationWords(generation, false),
  );
  const styleSeed = hashWords(HASH_DOMAINS.style, canonicalGenerationWords(generation, true));
  return {
    position: new CountedPrng(new Mulberry32(positionSeed)),
    positionJitter: new CountedPrng(
      new Mulberry32(hashWords(HASH_DOMAINS.position, [positionSeed, 0x4a495454])),
    ),
    velocity: new CountedPrng(new Mulberry32(velocitySeed)),
    style: new CountedPrng(new Mulberry32(styleSeed)),
    variation: new CountedPrng(
      new Mulberry32(
        hashWords(HASH_DOMAINS.variation, [GALAXY_TYPE_CODES[generation.type], generation.seed]),
      ),
    ),
  };
}

export function polar(radius: number, turns: number) {
  return {
    x: Math.fround(radius * cosTurn(turns)),
    y: Math.fround(radius * sinTurn(turns)),
  };
}

export function coreReservedPoint(size: number, uRadius: number, uAngle: number) {
  const radius = 0.95 * Math.max(2, size * 0.1) * Math.sqrt(uRadius);
  return polar(radius, uAngle);
}

const DISPERSION: Readonly<Record<GalaxyType, readonly [number, number]>> = Object.freeze({
  spiral: [0.01, 0.015],
  barredSpiral: [0.02, 0.025],
  elliptical: [0.08, 0.08],
  irregular: [0.06, 0.06],
  dwarf: [0.025, 0.03],
});

export function generateVelocity(
  x: number,
  y: number,
  generation: Readonly<GalaxyGenerationConfig>,
  velocityPrng: { nextFloat(): number },
) {
  const radius = Math.sqrt(x * x + y * y);
  const radialX = radius > 0 ? x / radius : 1;
  const radialY = radius > 0 ? y / radius : 0;
  const tangentialX = -radialY;
  const tangentialY = radialX;
  const circularSpeed = Math.sqrt(
    Math.max(0, radius * ownerRadialAcceleration(radius, generation, 1)),
  );
  const [radialSigma, tangentialSigma] = DISPERSION[generation.type];
  const radialSpeed = normalLike(velocityPrng) * radialSigma * circularSpeed;
  const tangentialJitter = normalLike(velocityPrng) * tangentialSigma * circularSpeed;
  const tangentialSpeed = generation.spin * circularSpeed + tangentialJitter;
  return {
    vx: Math.fround(radialX * radialSpeed + tangentialX * tangentialSpeed),
    vy: Math.fround(radialY * radialSpeed + tangentialY * tangentialSpeed),
  };
}

const PALETTES: Readonly<Record<GalaxyType, readonly (readonly [number, number, number])[]>> =
  Object.freeze({
    spiral: [
      [116, 168, 255],
      [192, 215, 255],
      [255, 230, 184],
    ],
    barredSpiral: [
      [142, 155, 255],
      [217, 197, 255],
      [255, 202, 153],
    ],
    elliptical: [
      [218, 184, 142],
      [244, 216, 176],
      [255, 239, 207],
    ],
    irregular: [
      [104, 210, 218],
      [174, 153, 255],
      [255, 142, 191],
    ],
    dwarf: [
      [132, 171, 214],
      [190, 206, 226],
      [231, 222, 196],
    ],
  });

function channel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function generateStyle(type: GalaxyType, prng: { nextFloat(): number }) {
  const paletteChoice = prng.nextFloat();
  const brightnessChoice = prng.nextFloat();
  const sizeChoice = prng.nextFloat();
  const alphaChoice = prng.nextFloat();
  const paletteIndex = paletteChoice < 0.25 ? 0 : paletteChoice < 0.8 ? 1 : 2;
  const selected = PALETTES[type][paletteIndex]!;
  const brightness = 0.75 + 0.25 * brightnessChoice;
  return {
    red: channel(selected[0] * brightness),
    green: channel(selected[1] * brightness),
    blue: channel(selected[2] * brightness),
    alpha: Math.round(150 + 90 * alphaChoice),
    pointSize: sizeChoice < 0.82 ? 1 : sizeChoice < 0.98 ? 2 : 3,
  };
}

export function copyDiagnostics(
  target: GenerationDiagnostics | undefined,
  streams: ReturnType<typeof createGenerationStreams>,
) {
  if (!target) return;
  target.positionDraws = streams.position.draws;
  target.positionJitterDraws = streams.positionJitter.draws;
  target.velocityDraws = streams.velocity.draws;
  target.styleDraws = streams.style.draws;
}
