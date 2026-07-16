import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ESLint } from "eslint";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalGenerationBytes,
  canonicalGenerationDigest,
  type DigestibleGalaxy,
} from "../../src/generation/canonicalDigest";
import { normalLike } from "../../src/generation/deterministicMath";
import { float64Words, hashWords } from "../../src/generation/hashWords";
import { mix32 } from "../../src/generation/mix32";
import { Mulberry32 } from "../../src/generation/mulberry32";
import { cosTurn, sinTurn } from "../../src/generation/sineTable";
import { SINE_TABLE_BYTES, SINE_TABLE_DIGEST } from "../../src/generation/sineTableDigest";

function independentMix(value: number) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

function independentHash(domain: number, words: number[]) {
  let value = independentMix((domain ^ 0x9e3779b9) >>> 0);
  for (const word of words) value = independentMix((value ^ (word >>> 0)) >>> 0);
  return value;
}

const sinePath = new URL("../../src/generation/generated/sine-f32.bin", import.meta.url);

describe("deterministic primitives", () => {
  it.each([
    [0, [0x4434b462, 0x00159c37, 0x39285b08, 0x256d8104, 0x77a2cbd4]],
    [1, [0xa087eaf3, 0x00b349c9, 0x8706c4eb, 0xfb2627fd, 0xf7e79d2b]],
    [0xffff_ffff, [0xe57bf3d3, 0x3081a5a4, 0xb7350390, 0xf1ade904, 0xd8616a2f]],
  ])("matches the Mulberry32 vector for seed %s", (seed, expected) => {
    const prng = new Mulberry32(seed);
    expect(Array.from({ length: 5 }, () => prng.nextUint32())).toEqual(expected);
  });

  it("matches fixed hash vectors and an independent reference", () => {
    const vectors = [
      { domain: 0, words: [], expected: 0x01fce552 },
      { domain: 0x504f534e, words: [0, 1, 0xffff_ffff], expected: 0xe92fec98 },
      { domain: 0x4d455247, words: [0x12345678, 0x9abcdef0], expected: 0x8f81c865 },
    ];
    for (const vector of vectors) {
      expect(hashWords(vector.domain, vector.words)).toBe(vector.expected);
      expect(independentHash(vector.domain, vector.words)).toBe(vector.expected);
    }
    expect(mix32(0x12345678)).toBe(independentMix(0x12345678));
    const words = float64Words(-123.5);
    const reference = new DataView(new ArrayBuffer(8));
    reference.setFloat64(0, -123.5, true);
    expect(words).toEqual([reference.getUint32(0, true), reference.getUint32(4, true)]);
    expect(float64Words(-0)).toEqual(float64Words(0));
  });

  it("verifies the committed sine bytes, quadrants, interpolation, and wrap", async () => {
    const bytes = await readFile(sinePath);
    expect(bytes.byteLength).toBe(SINE_TABLE_BYTES);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(SINE_TABLE_DIGEST);
    expect(sinTurn(0)).toBe(0);
    expect(sinTurn(0.25)).toBe(1);
    expect(Math.abs(sinTurn(0.5))).toBeLessThan(1e-6);
    expect(sinTurn(0.75)).toBe(-1);
    expect(cosTurn(0)).toBe(1);
    expect(sinTurn(1.125)).toBe(sinTurn(0.125));
    expect(sinTurn(-0.875)).toBe(sinTurn(0.125));
  });

  it("normalLike consumes exactly twelve draws", () => {
    let calls = 0;
    const value = normalLike({
      nextFloat() {
        calls += 1;
        return calls / 13;
      },
    });
    expect(calls).toBe(12);
    expect(value).toBeCloseTo(0, 15);
  });

  it("encodes canonical little-endian bytes independent of source buffer layout", async () => {
    const padded = new ArrayBuffer(24);
    const source = new Float32Array(padded, 4, 2);
    source.set([1.5, -2.25]);
    const galaxy: DigestibleGalaxy = {
      x: source,
      y: new Float32Array([3.25, 4.5]),
      vx: new Float32Array([-0, 6.75]),
      vy: new Float32Array([7.5, -8.125]),
      red: new Uint8Array([1, 2]),
      green: new Uint8Array([3, 4]),
      blue: new Uint8Array([5, 6]),
      alpha: new Uint8Array([7, 8]),
      pointSize: new Uint8Array([2, 3]),
    };
    const actual = canonicalGenerationBytes(galaxy);
    const expected = new Uint8Array(actual.length);
    const header = new TextEncoder().encode("GALAXIA-GEN-1");
    expected.set(header);
    const view = new DataView(expected.buffer);
    let offset = header.length;
    view.setUint32(offset, 2, true);
    offset += 4;
    for (const array of [galaxy.x, galaxy.y, galaxy.vx, galaxy.vy]) {
      for (const value of array) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
    }
    for (const style of [galaxy.red, galaxy.green, galaxy.blue, galaxy.alpha, galaxy.pointSize]) {
      expected.set(style, offset);
      offset += style.length;
    }
    expect(actual).toEqual(expected);
    expect(await canonicalGenerationDigest(galaxy)).toBe(
      createHash("sha256").update(expected).digest("hex"),
    );
    new Uint8Array(padded).fill(0xff, 0, 4);
    expect(canonicalGenerationBytes(galaxy)).toEqual(expected);
  });

  it("the generation lint fixture rejects every prohibited operation", async () => {
    const operations = [
      "random",
      "acos",
      "acosh",
      "asin",
      "asinh",
      "atan",
      "atanh",
      "atan2",
      "cbrt",
      "cos",
      "cosh",
      "exp",
      "expm1",
      "hypot",
      "log",
      "log1p",
      "log2",
      "log10",
      "pow",
      "sin",
      "sinh",
      "tan",
      "tanh",
    ];
    const source = `${operations.map((operation) => `Math.${operation}(1, 2);`).join("\n")}\n2 ** 3;\n`;
    const [result] = await new ESLint().lintText(source, {
      filePath: "src/generation/prohibited-fixture.js",
    });
    expect(result?.messages).toHaveLength(operations.length + 1);
    expect(result?.messages.every((message) => message.severity === 2)).toBe(true);
  });

  it("throws the stable not-ready error in an isolated uninstalled module", async () => {
    vi.resetModules();
    const isolated = await import("../../src/generation/sineTable");
    expect(() => isolated.sinTurn(0)).toThrow("SINE_TABLE_NOT_READY");
  });
});
