import type { GalaxyGenerationConfig } from "../../domain/types";
import { cosTurn, sinTurn } from "../sineTable";
import {
  allocateGeneratedGalaxy,
  copyDiagnostics,
  coreReservedPoint,
  createGenerationStreams,
  generateStyle,
  generateVelocity,
  type GeneratedGalaxy,
  type GenerationDiagnostics,
} from "../shared";

export function generateElliptical(
  generation: Readonly<GalaxyGenerationConfig>,
  diagnostics?: GenerationDiagnostics,
): GeneratedGalaxy {
  if (generation.type !== "elliptical") throw new Error("Elliptical configuration required.");
  const output = allocateGeneratedGalaxy(generation.starCount);
  const streams = createGenerationStreams(generation);
  const orientation = streams.variation.nextFloat();
  const axisRatio = 0.55 + 0.25 * streams.variation.nextFloat();
  const rotationCos = cosTurn(orientation);
  const rotationSin = sinTurn(orientation);
  for (let index = 0; index < generation.starCount; index += 1) {
    const u0 = streams.position.nextFloat();
    const u1 = streams.position.nextFloat();
    streams.position.nextFloat();
    streams.position.nextFloat();
    let point;
    if (index < 10) {
      point = coreReservedPoint(generation.size, u0, u1);
    } else {
      const radius = generation.size * u0 * u0;
      const localX = radius * cosTurn(u1);
      const localY = axisRatio * radius * sinTurn(u1);
      point = {
        x: Math.fround(localX * rotationCos - localY * rotationSin),
        y: Math.fround(localX * rotationSin + localY * rotationCos),
      };
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
