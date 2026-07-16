import { describe, expect, it } from "vitest";

import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import { canonicalGenerationBytes } from "../../src/generation/canonicalDigest";
import { generateBarredSpiral } from "../../src/generation/generators/barredSpiral";
import { generateDwarf } from "../../src/generation/generators/dwarf";
import { generateElliptical } from "../../src/generation/generators/elliptical";
import { generateIrregular } from "../../src/generation/generators/irregular";
import { generateSpiral } from "../../src/generation/generators/spiral";
import {
  copyDiagnostics,
  createGenerationStreams,
  generateVelocity,
} from "../../src/generation/shared";

const wrong = { ...DEFAULT_GENERATION, type: "dwarf" as const, starCount: 12 };

describe("generation boundary validation", () => {
  it("rejects mismatched position and style array lengths", () => {
    const galaxy = {
      x: new Float32Array(1),
      y: new Float32Array(0),
      vx: new Float32Array(1),
      vy: new Float32Array(1),
      red: new Uint8Array(1),
      green: new Uint8Array(1),
      blue: new Uint8Array(1),
      alpha: new Uint8Array(1),
      pointSize: new Uint8Array(1),
    };
    expect(() => canonicalGenerationBytes(galaxy)).toThrow("Generation array lengths differ");
    galaxy.y = new Float32Array(1);
    galaxy.red = new Uint8Array(0);
    expect(() => canonicalGenerationBytes(galaxy)).toThrow("Style array lengths differ");
  });

  it("rejects every generator/type mismatch", () => {
    expect(() => generateSpiral(wrong)).toThrow();
    expect(() => generateBarredSpiral(wrong)).toThrow();
    expect(() => generateElliptical({ ...wrong, type: "spiral" })).toThrow();
    expect(() => generateIrregular(wrong)).toThrow();
    expect(() => generateDwarf({ ...wrong, type: "spiral" })).toThrow();
  });

  it("covers the zero-radius velocity and optional diagnostics boundaries", () => {
    const streams = createGenerationStreams(wrong);
    expect(generateVelocity(0, 0, wrong, streams.velocity)).toEqual({ vx: 0, vy: 0 });
    copyDiagnostics(undefined, streams);
  });
});
