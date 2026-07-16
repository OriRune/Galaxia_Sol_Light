export const STARTING_PHYSICS = {
  dt: 1 / 60,
  baseG: 64,
  extendedSofteningFraction: 0.15,
  frictionGamma: 24,
  frictionSpeedScale: 3,
  frictionSpeedExponent: 8,
  maximumHalfFrictionFraction: 0.2,
  mergerSpeed: 1,
} as const;

export interface CalibrationTuple {
  baseG: number;
  extendedSofteningFraction: number;
  tidalGain: number;
  frictionGamma: number;
  frictionSpeedScale: number;
}

export function* orderedCalibrationGrid(): Generator<CalibrationTuple> {
  for (const baseG of [60, 64, 68]) {
    for (const extendedSofteningFraction of [0.12, 0.15, 0.18]) {
      for (const tidalGain of [4, 4.5, 5, 5.5]) {
        for (const frictionGamma of [18, 24, 30]) {
          for (const frictionSpeedScale of [2.5, 3, 3.5]) {
            yield {
              baseG,
              extendedSofteningFraction,
              tidalGain,
              frictionGamma,
              frictionSpeedScale,
            };
          }
        }
      }
    }
  }
}

export interface CalibrationCore {
  id: string;
  seed: number;
  starCount: number;
  size: number;
  mass: number;
  spin: number;
  blackHole: boolean;
  name: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface CalibrationState {
  cores: CalibrationCore[];
  stepIndex: number;
}

export interface CalibrationReport {
  defaultAttraction: { separation: number; decreaseRatio: number };
  scenario5: { separation: number; rotationDegrees: number; merged: boolean };
  slowCapture: { mergeTime: number; relativeSpeed: number };
  fastFlyby: {
    minimumFirstPassSpeedInsideMergerDistance: number;
    mergedBeforeSix: boolean;
    eventualMergeTime: number;
  };
  merger: CalibrationCore;
  maximumMomentumResidual: number;
  maximumMomentumTolerance: number;
}

function defaultCore(id: string, seed: number, x: number, y: number, vx: number, vy: number) {
  return {
    id,
    seed,
    starCount: 5_000,
    size: 40,
    mass: 25,
    spin: 1,
    blackHole: false,
    name: null,
    x,
    y,
    vx,
    vy,
  } satisfies CalibrationCore;
}

export function defaultAttractionFixture(): CalibrationState {
  return {
    cores: [defaultCore("a", 1, -80, 0, 0, 0), defaultCore("b", 2, 80, 0, 0, 0)],
    stepIndex: 0,
  };
}

export function scenario5OrbitFixture(): CalibrationState {
  return {
    cores: [defaultCore("a", 1, -80, 0, 0, 2), defaultCore("b", 2, 80, 0, 0, -2)],
    stepIndex: 0,
  };
}

export function scenario5FlybyFixture(): CalibrationState {
  return {
    cores: [defaultCore("a", 1, -9, 0, 3, 0), defaultCore("b", 2, 9, 0, -3, 0)],
    stepIndex: 0,
  };
}

export function slowCaptureFixture(): CalibrationState {
  return {
    cores: [defaultCore("a", 1, -30, 0, 0, 0), defaultCore("b", 2, 30, 0, 0, 0)],
    stepIndex: 0,
  };
}

export function mergerFixture(): CalibrationState {
  const first = defaultCore("earlier", 11, -3, 0, 0.2, 0.1);
  first.starCount = 2_000;
  first.mass = 20;
  first.spin = 1.5;
  first.name = "Alpha";
  const second = defaultCore("later", 12, 3, 0, -0.1, -0.2);
  second.starCount = 3_000;
  second.mass = 30;
  second.size = 50;
  second.spin = -1;
  second.blackHole = true;
  second.name = "Beta";
  return { cores: [first, second], stepIndex: 7 };
}

export function coreRadius(core: Pick<CalibrationCore, "size">) {
  return Math.max(2, core.size * 0.1);
}

export function plummerPairAcceleration(
  first: CalibrationCore,
  second: CalibrationCore,
  gravity = 1,
) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const epsilonA = STARTING_PHYSICS.extendedSofteningFraction * first.size;
  const epsilonB = STARTING_PHYSICS.extendedSofteningFraction * second.size;
  const epsilonSquared = epsilonA * epsilonA + epsilonB * epsilonB;
  const squared = dx * dx + dy * dy + epsilonSquared;
  const denominator = squared * Math.sqrt(squared);
  if (!(denominator > 0) || !Number.isFinite(denominator)) {
    throw new Error("Invalid Plummer denominator.");
  }
  const scalar = (STARTING_PHYSICS.baseG * gravity) / denominator;
  return {
    firstAx: dx * scalar * second.mass,
    firstAy: dy * scalar * second.mass,
    secondAx: -dx * scalar * first.mass,
    secondAy: -dy * scalar * first.mass,
  };
}

export function overlapFrictionHalfImpulse(first: CalibrationCore, second: CalibrationCore) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const separation = Math.hypot(dx, dy);
  const support = first.size + second.size;
  const overlap = Math.min(1, Math.max(0, (support - separation) / support));
  const relativeVx = second.vx - first.vx;
  const relativeVy = second.vy - first.vy;
  const speed = Math.hypot(relativeVx, relativeVy);
  const q = speed / STARTING_PHYSICS.frictionSpeedScale;
  const q2 = q * q;
  const q4 = q2 * q2;
  const q8 = q4 * q4;
  const gamma = (STARTING_PHYSICS.frictionGamma * overlap * overlap) / (1 + q8);
  const k = Math.min(
    STARTING_PHYSICS.maximumHalfFrictionFraction,
    Math.max(0, gamma * (STARTING_PHYSICS.dt / 2)),
  );
  const beforeX = first.mass * first.vx + second.mass * second.vx;
  const beforeY = first.mass * first.vy + second.mass * second.vy;
  const totalMass = first.mass + second.mass;
  const firstDeltaX = relativeVx * (second.mass / totalMass) * k;
  const firstDeltaY = relativeVy * (second.mass / totalMass) * k;
  const secondDeltaX = relativeVx * (-first.mass / totalMass) * k;
  const secondDeltaY = relativeVy * (-first.mass / totalMass) * k;
  first.vx += firstDeltaX;
  first.vy += firstDeltaY;
  second.vx += secondDeltaX;
  second.vy += secondDeltaY;
  const afterX = first.mass * first.vx + second.mass * second.vx;
  const afterY = first.mass * first.vy + second.mass * second.vy;
  return {
    k,
    residual: Math.hypot(afterX - beforeX, afterY - beforeY),
    tolerance:
      1e-10 *
      Math.max(
        1,
        Math.hypot(first.mass * first.vx, first.mass * first.vy),
        Math.hypot(second.mass * second.vx, second.mass * second.vy),
      ),
  };
}

function mix32(value: number) {
  let result = value >>> 0;
  result = (result ^ (result >>> 16)) >>> 0;
  result = Math.imul(result, 0x7feb352d) >>> 0;
  result = (result ^ (result >>> 15)) >>> 0;
  result = Math.imul(result, 0x846ca68b) >>> 0;
  return (result ^ (result >>> 16)) >>> 0;
}

function hashWords(domain: number, words: number[]) {
  let hash = mix32((domain ^ 0x9e3779b9) >>> 0);
  for (const word of words) hash = mix32((hash ^ (word >>> 0)) >>> 0);
  return hash;
}

function numberWords(value: number) {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, true);
  return [view.getUint32(0, true), view.getUint32(4, true)];
}

function configHash(core: CalibrationCore) {
  return hashWords(0x4d434647, [
    0,
    core.seed,
    core.starCount,
    ...numberWords(core.size),
    ...numberWords(core.mass),
    ...numberWords(core.spin),
    3,
    core.blackHole ? 1 : 0,
  ]);
}

export function mergeCores(
  first: CalibrationCore,
  second: CalibrationCore,
  stepIndex: number,
  pairOrdinal = 0,
) {
  const mass = first.mass + second.mass;
  const seed = hashWords(0x4d455247, [configHash(first), configHash(second)]);
  const singleName = first.name ?? second.name;
  const combinedName =
    first.name && second.name
      ? `${first.name} + ${second.name}`
      : singleName
        ? `${singleName} Remnant`
        : null;
  return {
    id: `m-${String(stepIndex)}-${seed.toString(16).padStart(8, "0")}-${String(pairOrdinal)}`,
    seed,
    starCount: first.starCount + second.starCount,
    size: Math.min(100, Math.sqrt(first.size * first.size + second.size * second.size)),
    mass,
    spin: Math.min(2, Math.max(-2, (first.mass * first.spin + second.mass * second.spin) / mass)),
    blackHole: first.blackHole || second.blackHole,
    name: combinedName ? Array.from(combinedName).slice(0, 80).join("") : null,
    x: (first.mass * first.x + second.mass * second.x) / mass,
    y: (first.mass * first.y + second.mass * second.y) / mass,
    vx: (first.mass * first.vx + second.mass * second.vx) / mass,
    vy: (first.mass * first.vy + second.mass * second.vy) / mass,
  } satisfies CalibrationCore;
}

function relativeSpeed(first: CalibrationCore, second: CalibrationCore) {
  return Math.hypot(second.vx - first.vx, second.vy - first.vy);
}

function separation(first: CalibrationCore, second: CalibrationCore) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function twoCores(state: CalibrationState): [CalibrationCore, CalibrationCore] {
  const first = state.cores[0];
  const second = state.cores[1];
  if (!first || !second) throw new Error("Expected a complete two-core fixture.");
  return [first, second];
}

function mergerEligible(first: CalibrationCore, second: CalibrationCore) {
  return (
    separation(first, second) <= coreRadius(first) + coreRadius(second) &&
    relativeSpeed(first, second) <= STARTING_PHYSICS.mergerSpeed
  );
}

export function stepCoreState(state: CalibrationState) {
  if (state.cores.length !== 2) return { merged: false, residual: 0, tolerance: 0 };
  const [first, second] = state.cores;
  if (!first || !second) throw new Error("Two-core state is incomplete.");
  if (mergerEligible(first, second)) {
    state.cores = [mergeCores(first, second, state.stepIndex)];
    state.stepIndex += 1;
    return { merged: true, residual: 0, tolerance: 0 };
  }
  const halfDt = STARTING_PHYSICS.dt / 2;
  const acceleration = plummerPairAcceleration(first, second);
  first.vx += acceleration.firstAx * halfDt;
  first.vy += acceleration.firstAy * halfDt;
  second.vx += acceleration.secondAx * halfDt;
  second.vy += acceleration.secondAy * halfDt;
  const firstFriction = overlapFrictionHalfImpulse(first, second);
  first.x += first.vx * STARTING_PHYSICS.dt;
  first.y += first.vy * STARTING_PHYSICS.dt;
  second.x += second.vx * STARTING_PHYSICS.dt;
  second.y += second.vy * STARTING_PHYSICS.dt;
  const nextAcceleration = plummerPairAcceleration(first, second);
  first.vx += nextAcceleration.firstAx * halfDt;
  first.vy += nextAcceleration.firstAy * halfDt;
  second.vx += nextAcceleration.secondAx * halfDt;
  second.vy += nextAcceleration.secondAy * halfDt;
  const secondFriction = overlapFrictionHalfImpulse(first, second);
  state.stepIndex += 1;
  return {
    merged: false,
    residual: Math.max(firstFriction.residual, secondFriction.residual),
    tolerance: Math.max(firstFriction.tolerance, secondFriction.tolerance),
  };
}

function runTo(state: CalibrationState, time: number) {
  let maximumMomentumResidual = 0;
  let maximumMomentumTolerance = 0;
  while (state.stepIndex < Math.round(time / STARTING_PHYSICS.dt) && state.cores.length === 2) {
    const result = stepCoreState(state);
    maximumMomentumResidual = Math.max(maximumMomentumResidual, result.residual);
    maximumMomentumTolerance = Math.max(maximumMomentumTolerance, result.tolerance);
  }
  return { maximumMomentumResidual, maximumMomentumTolerance };
}

export function runCorePhysicsProof(): CalibrationReport {
  let maximumMomentumResidual = 0;
  let maximumMomentumTolerance = 0;
  const includeMomentum = (result: {
    maximumMomentumResidual: number;
    maximumMomentumTolerance: number;
  }) => {
    maximumMomentumResidual = Math.max(maximumMomentumResidual, result.maximumMomentumResidual);
    maximumMomentumTolerance = Math.max(maximumMomentumTolerance, result.maximumMomentumTolerance);
  };

  const attraction = defaultAttractionFixture();
  includeMomentum(runTo(attraction, 30));
  const [attractionFirst, attractionSecond] = twoCores(attraction);
  const attractionSeparation = separation(attractionFirst, attractionSecond);

  const orbit = scenario5OrbitFixture();
  includeMomentum(runTo(orbit, 60));
  const [orbitFirst, orbitSecond] = twoCores(orbit);
  const orbitDx = orbitSecond.x - orbitFirst.x;
  const orbitDy = orbitSecond.y - orbitFirst.y;
  const rotationDegrees = Math.abs(Math.atan2(160 * orbitDy, 160 * orbitDx) * (180 / Math.PI));

  const slow = slowCaptureFixture();
  let slowRelativeSpeed = 0;
  while (slow.cores.length === 2 && slow.stepIndex < 240 * 60) {
    const [first, second] = twoCores(slow);
    if (mergerEligible(first, second)) slowRelativeSpeed = relativeSpeed(first, second);
    const result = stepCoreState(slow);
    maximumMomentumResidual = Math.max(maximumMomentumResidual, result.residual);
    maximumMomentumTolerance = Math.max(maximumMomentumTolerance, result.tolerance);
  }
  const slowMergeTime = (slow.stepIndex - 1) * STARTING_PHYSICS.dt;

  const flyby = scenario5FlybyFixture();
  let minimumFirstPassSpeed = Number.POSITIVE_INFINITY;
  let exitedFirstPass = false;
  let mergedBeforeSix = false;
  let eventualMergeTime = Number.NaN;
  while (flyby.cores.length === 2 && flyby.stepIndex < 30 * 60) {
    const [first, second] = twoCores(flyby);
    const distance = separation(first, second);
    if (!exitedFirstPass && distance <= coreRadius(first) + coreRadius(second)) {
      minimumFirstPassSpeed = Math.min(minimumFirstPassSpeed, relativeSpeed(first, second));
    } else if (!exitedFirstPass && flyby.stepIndex > 0 && distance > 8 && first.x > second.x) {
      exitedFirstPass = true;
    }
    if (mergerEligible(first, second)) eventualMergeTime = flyby.stepIndex * STARTING_PHYSICS.dt;
    const result = stepCoreState(flyby);
    maximumMomentumResidual = Math.max(maximumMomentumResidual, result.residual);
    maximumMomentumTolerance = Math.max(maximumMomentumTolerance, result.tolerance);
    if (result.merged && flyby.stepIndex * STARTING_PHYSICS.dt <= 6) mergedBeforeSix = true;
  }

  const merger = mergerFixture();
  stepCoreState(merger);
  const remnant = merger.cores[0];
  if (!remnant) throw new Error("Merger fixture produced no remnant.");

  return {
    defaultAttraction: {
      separation: attractionSeparation,
      decreaseRatio: (160 - attractionSeparation) / 160,
    },
    scenario5: {
      separation: separation(orbitFirst, orbitSecond),
      rotationDegrees,
      merged: orbit.cores.length !== 2,
    },
    slowCapture: { mergeTime: slowMergeTime, relativeSpeed: slowRelativeSpeed },
    fastFlyby: {
      minimumFirstPassSpeedInsideMergerDistance: minimumFirstPassSpeed,
      mergedBeforeSix,
      eventualMergeTime,
    },
    merger: remnant,
    maximumMomentumResidual,
    maximumMomentumTolerance,
  };
}
