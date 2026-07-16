/* eslint-disable @typescript-eslint/no-non-null-assertion -- Clump indices are clamped to the fixed array. */
import type { GalaxyGenerationConfig } from "../../domain/types";
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

export function generateIrregular(
  generation: Readonly<GalaxyGenerationConfig>,
  diagnostics?: GenerationDiagnostics,
): GeneratedGalaxy {
  if (generation.type !== "irregular") throw new Error("Irregular configuration required.");
  const output = allocateGeneratedGalaxy(generation.starCount);
  const streams = createGenerationStreams(generation);
  const clumps = Array.from({ length: 4 }, () =>
    polar(
      0.45 * generation.size * Math.sqrt(streams.variation.nextFloat()),
      streams.variation.nextFloat(),
    ),
  );
  for (let index = 0; index < generation.starCount; index += 1) {
    const u0 = streams.position.nextFloat();
    const u1 = streams.position.nextFloat();
    const u2 = streams.position.nextFloat();
    const u3 = streams.position.nextFloat();
    streams.position.nextFloat();
    let point;
    if (index < 10) {
      point = coreReservedPoint(generation.size, u0, u1);
    } else if (u0 < 0.8) {
      const clumpIndex = Math.min(3, Math.floor(u1 * 4));
      const center = clumps[clumpIndex]!;
      const local = polar(0.3 * generation.size * Math.sqrt(u2), u3);
      point = { x: Math.fround(center.x + local.x), y: Math.fround(center.y + local.y) };
    } else {
      point = polar(generation.size * Math.sqrt(u2), u3);
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
