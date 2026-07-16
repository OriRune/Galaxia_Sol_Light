/* eslint-disable @typescript-eslint/no-non-null-assertion -- Validated topology guarantees owner and state indices. */
import {
  EXTENDED_SOFTENING_FRACTION,
  ownerRadialAcceleration,
  plummerRadialAcceleration,
} from "../domain/physicsContract";
import { TIDAL_DIFFERENTIAL_GAIN } from "./constants";
import type { EngineTopology, StateBank } from "./engine";

export function writeStarAcceleration(
  bank: StateBank,
  topology: EngineTopology,
  gravity: number,
  star: number,
  output: Float64Array,
) {
  const owner = topology.ownerSlot[star];
  if (owner === undefined) throw new Error("INVALID_SIMULATION_STATE");
  const descriptor = topology.descriptors[owner];
  if (!descriptor) throw new Error("INVALID_SIMULATION_STATE");
  const starX = bank.starX[star]!;
  const starY = bank.starY[star]!;
  const ownerX = bank.coreX[owner]!;
  const ownerY = bank.coreY[owner]!;
  const relativeX = starX - ownerX;
  const relativeY = starY - ownerY;
  const radius = Math.hypot(relativeX, relativeY);
  const internalMagnitude = ownerRadialAcceleration(radius, descriptor.generation, gravity);
  let internalX = 0;
  let internalY = 0;
  if (radius > 0) {
    internalX = (-relativeX / radius) * internalMagnitude;
    internalY = (-relativeY / radius) * internalMagnitude;
  }
  let differentialX = 0;
  let differentialY = 0;
  for (let other = 0; other < topology.descriptors.length; other += 1) {
    if (other === owner) continue;
    const otherDescriptor = topology.descriptors[other];
    if (!otherDescriptor) throw new Error("INVALID_SIMULATION_STATE");
    const ownerSoftening = EXTENDED_SOFTENING_FRACTION * descriptor.generation.size;
    const otherSoftening = EXTENDED_SOFTENING_FRACTION * otherDescriptor.generation.size;
    const softening = Math.sqrt(ownerSoftening * ownerSoftening + otherSoftening * otherSoftening);
    const starDx = bank.coreX[other]! - starX;
    const starDy = bank.coreY[other]! - starY;
    const starDistance = Math.hypot(starDx, starDy);
    const starMagnitude = plummerRadialAcceleration(
      starDistance,
      otherDescriptor.generation.mass,
      softening,
      gravity,
    );
    const ownerDx = bank.coreX[other]! - ownerX;
    const ownerDy = bank.coreY[other]! - ownerY;
    const ownerDistance = Math.hypot(ownerDx, ownerDy);
    const ownerMagnitude = plummerRadialAcceleration(
      ownerDistance,
      otherDescriptor.generation.mass,
      softening,
      gravity,
    );
    const starAccelerationX = starDistance > 0 ? (starDx / starDistance) * starMagnitude : 0;
    const starAccelerationY = starDistance > 0 ? (starDy / starDistance) * starMagnitude : 0;
    const ownerAccelerationX = ownerDistance > 0 ? (ownerDx / ownerDistance) * ownerMagnitude : 0;
    const ownerAccelerationY = ownerDistance > 0 ? (ownerDy / ownerDistance) * ownerMagnitude : 0;
    differentialX += starAccelerationX - ownerAccelerationX;
    differentialY += starAccelerationY - ownerAccelerationY;
  }
  output[0] = bank.coreAx[owner]! + internalX + TIDAL_DIFFERENTIAL_GAIN * differentialX;
  output[1] = bank.coreAy[owner]! + internalY + TIDAL_DIFFERENTIAL_GAIN * differentialY;
}

export function halfKickStars(
  bank: StateBank,
  topology: EngineTopology,
  gravity: number,
  halfDt: number,
  workspace: Float64Array,
) {
  for (let star = 0; star < bank.starX.length; star += 1) {
    writeStarAcceleration(bank, topology, gravity, star, workspace);
    bank.starVx[star] = Math.fround(bank.starVx[star]! + workspace[0]! * halfDt);
    bank.starVy[star] = Math.fround(bank.starVy[star]! + workspace[1]! * halfDt);
  }
}
