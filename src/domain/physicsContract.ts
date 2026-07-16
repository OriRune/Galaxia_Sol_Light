import type { GalaxyGenerationConfig } from "./types";

export const BASE_G = 64;
export const EXTENDED_SOFTENING_FRACTION = 0.15;
export const BLACK_HOLE_SOFTENING_FRACTION = 0.25;

export function plummerRadialAcceleration(
  radius: number,
  mass: number,
  softening: number,
  gravity: number,
) {
  if (radius === 0) return 0;
  const squared = radius * radius + softening * softening;
  const denominator = squared * Math.sqrt(squared);
  if (!(denominator > 0) || !Number.isFinite(denominator)) {
    throw new RangeError("Invalid Plummer denominator.");
  }
  return (BASE_G * gravity * mass * radius) / denominator;
}

export function ownerRadialAcceleration(
  radius: number,
  generation: Readonly<GalaxyGenerationConfig>,
  gravity: number,
) {
  if (radius === 0) return 0;
  const extendedSoftening = EXTENDED_SOFTENING_FRACTION * generation.size;
  if (!generation.blackHole) {
    return plummerRadialAcceleration(radius, generation.mass, extendedSoftening, gravity);
  }
  const coreRadius = Math.max(2, generation.size * 0.1);
  return (
    plummerRadialAcceleration(radius, generation.mass * 0.9, extendedSoftening, gravity) +
    plummerRadialAcceleration(
      radius,
      generation.mass * 0.1,
      BLACK_HOLE_SOFTENING_FRACTION * coreRadius,
      gravity,
    )
  );
}
