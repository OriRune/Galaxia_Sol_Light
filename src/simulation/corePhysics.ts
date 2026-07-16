/* eslint-disable @typescript-eslint/no-non-null-assertion -- Engine validation guarantees parallel-array indices. */
import { EXTENDED_SOFTENING_FRACTION, plummerRadialAcceleration } from "../domain/physicsContract";
import type { GalaxyDescriptor } from "./protocol";
import {
  DT,
  FRICTION_GAMMA_MAXIMUM,
  FRICTION_SPEED_SCALE,
  MAXIMUM_HALF_FRICTION_FRACTION,
} from "./constants";
import type { EngineTopology, StateBank } from "./engine";

export interface FrictionWorkspace {
  deltaX: Float64Array;
  deltaY: Float64Array;
  snapshotVx: Float64Array;
  snapshotVy: Float64Array;
}

export function createFrictionWorkspace(coreCount: number): FrictionWorkspace {
  return {
    deltaX: new Float64Array(coreCount),
    deltaY: new Float64Array(coreCount),
    snapshotVx: new Float64Array(coreCount),
    snapshotVy: new Float64Array(coreCount),
  };
}

export function accumulateCoreAccelerations(
  bank: StateBank,
  descriptors: readonly GalaxyDescriptor[],
  gravity: number,
) {
  bank.coreAx.fill(0);
  bank.coreAy.fill(0);
  for (let first = 0; first < descriptors.length; first += 1) {
    for (let second = first + 1; second < descriptors.length; second += 1) {
      const firstDescriptor = descriptors[first];
      const secondDescriptor = descriptors[second];
      if (!firstDescriptor || !secondDescriptor) throw new Error("INVALID_SIMULATION_STATE");
      const dx = bank.coreX[second]! - bank.coreX[first]!;
      const dy = bank.coreY[second]! - bank.coreY[first]!;
      const distance = Math.hypot(dx, dy);
      const firstSoftening = EXTENDED_SOFTENING_FRACTION * firstDescriptor.generation.size;
      const secondSoftening = EXTENDED_SOFTENING_FRACTION * secondDescriptor.generation.size;
      const softening = Math.sqrt(
        firstSoftening * firstSoftening + secondSoftening * secondSoftening,
      );
      const unitX = distance > 0 ? dx / distance : 0;
      const unitY = distance > 0 ? dy / distance : 0;
      const firstMagnitude = plummerRadialAcceleration(
        distance,
        secondDescriptor.generation.mass,
        softening,
        gravity,
      );
      const secondMagnitude = plummerRadialAcceleration(
        distance,
        firstDescriptor.generation.mass,
        softening,
        gravity,
      );
      bank.coreAx[first] = bank.coreAx[first]! + unitX * firstMagnitude;
      bank.coreAy[first] = bank.coreAy[first]! + unitY * firstMagnitude;
      bank.coreAx[second] = bank.coreAx[second]! - unitX * secondMagnitude;
      bank.coreAy[second] = bank.coreAy[second]! - unitY * secondMagnitude;
    }
  }
}

export function applyOverlapFrictionHalfImpulse(
  bank: StateBank,
  topology: EngineTopology,
  workspace: FrictionWorkspace,
  halfDt = DT / 2,
) {
  const count = topology.descriptors.length;
  const { deltaX, deltaY, snapshotVx, snapshotVy } = workspace;
  if (deltaX.length !== count) throw new Error("INVALID_SIMULATION_STATE");
  deltaX.fill(0);
  deltaY.fill(0);
  snapshotVx.set(bank.coreVx);
  snapshotVy.set(bank.coreVy);
  for (let first = 0; first < count; first += 1) {
    for (let second = first + 1; second < count; second += 1) {
      const firstDescriptor = topology.descriptors[first];
      const secondDescriptor = topology.descriptors[second];
      if (!firstDescriptor || !secondDescriptor) throw new Error("INVALID_SIMULATION_STATE");
      const dx = bank.coreX[second]! - bank.coreX[first]!;
      const dy = bank.coreY[second]! - bank.coreY[first]!;
      const separation = Math.hypot(dx, dy);
      const support = firstDescriptor.generation.size + secondDescriptor.generation.size;
      const overlap = Math.min(1, Math.max(0, (support - separation) / support));
      const relativeX = snapshotVx[second]! - snapshotVx[first]!;
      const relativeY = snapshotVy[second]! - snapshotVy[first]!;
      const speed = Math.hypot(relativeX, relativeY);
      const q = speed / FRICTION_SPEED_SCALE;
      const q2 = q * q;
      const q4 = q2 * q2;
      const q8 = q4 * q4;
      const gamma = (FRICTION_GAMMA_MAXIMUM * overlap * overlap) / (1 + q8);
      const fraction = Math.min(MAXIMUM_HALF_FRICTION_FRACTION, Math.max(0, gamma * halfDt));
      const firstMass = firstDescriptor.generation.mass;
      const secondMass = secondDescriptor.generation.mass;
      const totalMass = firstMass + secondMass;
      deltaX[first] = deltaX[first]! + relativeX * (secondMass / totalMass) * fraction;
      deltaY[first] = deltaY[first]! + relativeY * (secondMass / totalMass) * fraction;
      deltaX[second] = deltaX[second]! - relativeX * (firstMass / totalMass) * fraction;
      deltaY[second] = deltaY[second]! - relativeY * (firstMass / totalMass) * fraction;
    }
  }
  for (let core = 0; core < count; core += 1) {
    bank.coreVx[core] = bank.coreVx[core]! + deltaX[core]!;
    bank.coreVy[core] = bank.coreVy[core]! + deltaY[core]!;
  }
  for (let star = 0; star < topology.ownerSlot.length; star += 1) {
    const owner = topology.ownerSlot[star]!;
    bank.starVx[star] = Math.fround(bank.starVx[star]! + deltaX[owner]!);
    bank.starVy[star] = Math.fround(bank.starVy[star]! + deltaY[owner]!);
  }
}
