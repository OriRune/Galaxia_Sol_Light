import { describe, expect, it } from "vitest";

import { FRAME_POOL_SIZE, FramePool } from "../../src/simulation/framePool";

describe("production three-buffer frame pool", () => {
  it("allows one outstanding lease and accepts its exact return", () => {
    expect(FRAME_POOL_SIZE).toBe(3);
    const pool = new FramePool(20);
    const first = pool.publicationOpportunity();
    expect(first.lease?.buffer.byteLength).toBe(80);
    expect(pool.publicationOpportunity().lease).toBeNull();
    const lease = first.lease;
    if (!lease) throw new Error("Expected frame lease.");
    expect(pool.returnLease(lease.leaseId, lease.buffer)).toBe(true);
    expect(pool.publicationOpportunity().lease).not.toBeNull();
  });

  it("rebuilds after three missed opportunities and ignores an old return", () => {
    const pool = new FramePool(4);
    const first = pool.publicationOpportunity().lease;
    if (!first) throw new Error("Expected frame lease.");
    expect(pool.publicationOpportunity().rebuilt).toBe(false);
    expect(pool.publicationOpportunity().rebuilt).toBe(false);
    expect(pool.publicationOpportunity().rebuilt).toBe(true);
    expect(pool.returnLease(first.leaseId, first.buffer)).toBe(false);
    expect(pool.publicationOpportunity().lease).not.toBeNull();
  });

  it("rebuilds cleanly for a topology star-count change", () => {
    const pool = new FramePool(4);
    pool.resize(4);
    pool.resize(12);
    expect(pool.publicationOpportunity().lease?.buffer.byteLength).toBe(48);
  });
});
