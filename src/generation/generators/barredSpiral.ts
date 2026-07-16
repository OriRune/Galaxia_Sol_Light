import type { GalaxyGenerationConfig } from "../../domain/types";
import { normalLike } from "../deterministicMath";
import { cosTurn, sinTurn } from "../sineTable";
import {
  allocateGeneratedGalaxy,
  copyDiagnostics,
  coreReservedPoint,
  createGenerationStreams,
  generateStyle,
  generateVelocity,
  polar,
  type GeneratedGalaxy,
  type GenerationDiagnostics,
} from "../shared";

export function generateBarredSpiral(
  generation: Readonly<GalaxyGenerationConfig>,
  diagnostics?: GenerationDiagnostics,
): GeneratedGalaxy {
  if (generation.type !== "barredSpiral" || generation.armCount === null) {
    throw new Error("Barred-spiral generator requires a barred-spiral configuration with arms.");
  }
  const output = allocateGeneratedGalaxy(generation.starCount);
  const streams = createGenerationStreams(generation);
  const orientation = streams.variation.nextFloat();
  const orientationCos = cosTurn(orientation);
  const orientationSin = sinTurn(orientation);
  for (let index = 0; index < generation.starCount; index += 1) {
    const u0 = streams.position.nextFloat();
    const u1 = streams.position.nextFloat();
    const u2 = streams.position.nextFloat();
    streams.position.nextFloat();
    const u4 = streams.position.nextFloat();
    const width = normalLike(streams.positionJitter);
    let point;
    if (index < 10) {
      point = coreReservedPoint(generation.size, u0, u1);
    } else if (u2 < 0.28) {
      const localX = (2 * u0 - 1) * 0.48 * generation.size;
      const taper = 1 - Math.abs(localX) / (0.48 * generation.size);
      const localY = width * 0.055 * generation.size * Math.max(0.2, taper);
      point = {
        x: Math.fround(localX * orientationCos - localY * orientationSin),
        y: Math.fround(localX * orientationSin + localY * orientationCos),
      };
    } else {
      const radius = generation.size * (0.2 + 0.8 * Math.sqrt(u0));
      const arm = Math.min(generation.armCount - 1, Math.floor(u1 * generation.armCount));
      const handedness = generation.spin < 0 ? -1 : 1;
      const turns =
        orientation +
        arm / generation.armCount +
        (handedness * 0.7 * radius) / generation.size +
        width * 0.02 +
        0.03 * (u4 - 0.5);
      point = polar(radius, turns);
    }
    output.x[index] = point.x;
    output.y[index] = point.y;
    const velocity = generateVelocity(point.x, point.y, generation, streams.velocity);
    output.vx[index] = velocity.vx;
    output.vy[index] = velocity.vy;
    const style = generateStyle(generation.type, streams.style);
    output.red[index] = style.red;
    output.green[index] = style.green;
    output.blue[index] = style.blue;
    output.alpha[index] = style.alpha;
    output.pointSize[index] = style.pointSize;
  }
  copyDiagnostics(diagnostics, streams);
  return output;
}
