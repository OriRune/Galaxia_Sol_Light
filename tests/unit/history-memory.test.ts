import { describe, expect, it } from "vitest";
import { runHistoryMemoryProof } from "../../perf/history-memory";

describe("120,000-star history storage proof", () => {
  it("preserves exact state, sharing, topology, LRU, and memory bounds", async () => {
    const result = await runHistoryMemoryProof();
    expect(result).toMatchObject({
      starCount: 120_000,
      keyframes: 31,
      undoSnapshots: 20,
      cacheEntries: 10,
      cacheEvictions: 9,
      denseCacheEntries: 10,
      denseEvictions: 290,
      ownerSlotsMatch: true,
    });
    expect(result.originalDigest).toBe(result.restoredDigest);
    expect(result.latestStyleReferenceCount).toBeGreaterThan(1);
    expect(result.styleBlocks).toBe(31);
    expect(result.retainedBytes).toBeLessThanOrEqual(result.retainedLimitBytes);
    expect(result.transientBytes).toBeLessThanOrEqual(result.transientLimitBytes);
  }, 30_000);
});
