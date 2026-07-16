import { describe, expect, it } from "vitest";
import { runCaptureStorageProof } from "../../perf/capture-storage";

describe("recording capture and storage proof", () => {
  it("encodes, persists, streams, exports explicitly, and deletes 300 full-HD frames", async () => {
    const result = await runCaptureStorageProof();
    console.info("CAPTURE_STORAGE_PROOF", JSON.stringify(result));
    expect(result).toMatchObject({
      width: 1920,
      height: 1080,
      frameCount: 300,
      maximumInFlight: 2,
      missedSlotsWhenSaturated: 1,
      fallbackClicks: 1,
      spikeDataDeleted: true,
    });
    expect(result.p95BlobBytes).toBeGreaterThan(0);
    expect(result.p95ToBlobMs).toBeGreaterThan(0);
    expect(result.p95IndexedDbWriteMs).toBeGreaterThanOrEqual(0);
    expect(result.measuredPartCount).toBeGreaterThan(0);
    expect(result.measuredLargestPartBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(result.streamedSpikePartBytes).toBeGreaterThanOrEqual(60 * 1024 * 1024);
    expect(result.streamedSpikePartBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(result.projectedFullSlotPartCount).toBeGreaterThan(0);
    expect(result.peakOwnedBytes).toBeGreaterThan(0);
  }, 180_000);
});
