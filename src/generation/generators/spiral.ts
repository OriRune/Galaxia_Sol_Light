import type { GalaxyGenerationConfig } from "../../domain/types";
import { normalLike } from "../deterministicMath";
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

export function generateSpiral(
  generation: Readonly<GalaxyGenerationConfig>,
  diagnostics?: GenerationDiagnostics,
): GeneratedGalaxy {
  if (generation.type !== "spiral" || generation.armCount === null) {
    throw new Error("Spiral generator requires a spiral configuration with arms.");
  }
  const output = allocateGeneratedGalaxy(generation.starCount);
  const streams = createGenerationStreams(generation);
  for (let index = 0; index < generation.starCount; index += 1) {
    const u0 = streams.position.nextFloat();
    const u1 = streams.position.nextFloat();
    const u2 = streams.position.nextFloat();
    const u3 = streams.position.nextFloat();
    const width = normalLike(streams.positionJitter);
    let point;
    if (index < 10) {
      point = coreReservedPoint(generation.size, u0, u1);
    } else if (u2 < 0.15) {
      point = polar(0.25 * generation.size * Math.sqrt(u0), u1);
    } else {
      const radius = generation.size * Math.sqrt(u0);
      const arm = Math.min(generation.armCount - 1, Math.floor(u1 * generation.armCount));
      const handedness = generation.spin < 0 ? -1 : 1;
      const armBaseTurns = arm / generation.armCount;
      const twistTurns = (handedness * 0.85 * radius) / generation.size;
      const widthTurns = width * 0.018 * (0.35 + (0.65 * radius) / generation.size);
      point = polar(radius, armBaseTurns + twistTurns + widthTurns + 0.04 * (u3 - 0.5));
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
