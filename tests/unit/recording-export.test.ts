import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  ZIP_FRAME_INPUT_BUDGET,
  buildRecordingPart,
  planRecordingParts,
  recordingManifest,
  withObjectUrl,
} from "../../src/capture/recordingExport";
import type { RecordingFrameRow, RecordingRow } from "../../src/persistence/databases";
const row: RecordingRow = {
  id: "r",
  name: "Recording",
  normalizedName: "recording",
  createdAt: "x",
  updatedAt: "x",
  state: "complete",
  width: 10,
  height: 10,
  devicePixelRatio: 1,
  mimeType: "image/png",
  nominalSlots: 3,
  capturedCount: 2,
  missedCount: 1,
  lastAttemptedSlot: 2,
  startedAtWall: "x",
  startedAtMonotonic: 0,
  durationMs: 100,
  effectiveSlotLimit: 300,
  terminalReason: "user",
  missedRanges: [[1, 1]],
};
const frame = (slot: number): RecordingFrameRow => ({
  recordingId: "r",
  slot,
  timestampMs: ((slot + 1) * 1000) / 30,
  mimeType: "image/png",
  byteLength: 1,
  blob: new Blob([String(slot)]),
});
describe("recording ZIP export", () => {
  it("preplans ordered parts within 63 MiB and rejects an oversized frame", () => {
    expect(
      planRecordingParts([
        { slot: 0, byteLength: ZIP_FRAME_INPUT_BUDGET },
        { slot: 2, byteLength: 1 },
      ]).parts,
    ).toEqual([[0], [2]]);
    expect(() => planRecordingParts([{ slot: 0, byteLength: ZIP_FRAME_INPUT_BUDGET + 1 }])).toThrow(
      "EXPORT_FAILED",
    );
  });
  it("repeats a complete manifest and maps nominal slots to files", async () => {
    const frames = [frame(0), frame(2)],
      plan = planRecordingParts(frames),
      manifest = recordingManifest(row, plan, 1, "0.1.0");
    expect(manifest.slots).toMatchObject([
      { slot: 0, captured: true, file: "frames/frame-000000.png" },
      { slot: 1, missed: true, file: null },
      { slot: 2, captured: true, file: "frames/frame-000002.png" },
    ]);
    const blob = await buildRecordingPart(row, plan, 1, "0.1.0", (slot) => {
      const found = frames.find((item) => item.slot === slot);
      if (!found) throw new Error("frame missing");
      return Promise.resolve(found);
    });
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const manifestBytes = archive["manifest.json"];
    if (!manifestBytes) throw new Error("manifest missing");
    expect(JSON.parse(strFromU8(manifestBytes))).toMatchObject({
      partNumber: 1,
      partCount: 1,
      nominalSlots: 3,
    });
    expect(Object.keys(archive)).toContain("frames/frame-000002.png");
  });
  it("revokes object URLs after the explicit click", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test"),
      revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined),
      click = vi.fn();
    withObjectUrl(new Blob(), click);
    expect(click).toHaveBeenCalledExactlyOnceWith("blob:test");
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:test");
    create.mockRestore();
    revoke.mockRestore();
  });
});
