import { describe, expect, it } from "vitest";

import { plummerRadialAcceleration } from "../../src/domain/physicsContract";
import { workerSignalSchema } from "../../src/domain/protocolSchemas";

describe("domain boundary normalization", () => {
  it("returns exact zero at the Plummer origin and rejects an infinite denominator", () => {
    expect(plummerRadialAcceleration(0, 25, 4, 1)).toBe(0);
    expect(() => plummerRadialAcceleration(Number.MAX_VALUE, 25, 4, 1)).toThrow(
      "Invalid Plummer denominator",
    );
  });

  it("normalizes negative zero in bounded protocol values", () => {
    const parsed = workerSignalSchema.parse({
      protocolVersion: 1,
      type: "TICK",
      payload: { nowMs: -0 },
    });
    expect(Object.is(parsed.payload.nowMs, -0)).toBe(false);
  });
});
