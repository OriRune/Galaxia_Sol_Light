import { describe, expect, it } from "vitest";
import { createProceduralStarPixels } from "../../src/rendering/ProductionRenderer";

describe("procedural star texture", () => {
  it("is a white 16px texture with the specified radial alpha", () => {
    const pixels = createProceduralStarPixels();
    expect(pixels).toHaveLength(16 * 16 * 4);
    expect(Array.from(pixels.slice((7 * 16 + 7) * 4, (7 * 16 + 7) * 4 + 4))).toEqual([
      255, 255, 255, 255,
    ]);
    expect(pixels[3]).toBe(0);
    const fadeAlpha = pixels[(7 * 16 + 12) * 4 + 3];
    expect(fadeAlpha).toBeGreaterThan(0);
    expect(fadeAlpha).toBeLessThan(255);
  });
});
