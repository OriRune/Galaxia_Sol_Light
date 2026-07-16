import { Zip, ZipPassThrough } from "fflate";
import type { RecordingFrameRow, RecordingRow } from "../persistence/databases";

export const ZIP_FRAME_INPUT_BUDGET = 63 * 1024 * 1024;
export interface ExportPlan {
  parts: number[][];
  slotPart: Map<number, number>;
}
export function planRecordingParts(
  metadata: readonly Pick<RecordingFrameRow, "slot" | "byteLength">[],
): ExportPlan {
  const parts: number[][] = [[]];
  let bytes = 0;
  for (const frame of [...metadata].sort((left, right) => left.slot - right.slot)) {
    if (frame.byteLength > ZIP_FRAME_INPUT_BUDGET) throw new Error("EXPORT_FAILED");
    if (bytes + frame.byteLength > ZIP_FRAME_INPUT_BUDGET) {
      parts.push([]);
      bytes = 0;
    }
    parts.at(-1)?.push(frame.slot);
    bytes += frame.byteLength;
  }
  if (parts.length === 1 && parts[0]?.length === 0) parts.length = 0;
  const slotPart = new Map<number, number>();
  parts.forEach((slots, index) => {
    slots.forEach((slot) => {
      slotPart.set(slot, index + 1);
    });
  });
  return { parts, slotPart };
}

export function recordingManifest(
  row: RecordingRow,
  plan: ExportPlan,
  partNumber: number,
  appVersion: string,
) {
  const extension = row.mimeType === "image/webp" ? "webp" : "png";
  return {
    kind: "galaxia-recording",
    schemaVersion: 1,
    appVersion,
    recordingId: row.id,
    name: row.name,
    width: row.width,
    height: row.height,
    devicePixelRatio: row.devicePixelRatio,
    nominalSlots: row.nominalSlots,
    capturedCount: row.capturedCount,
    missedCount: row.missedCount,
    durationMs: row.durationMs,
    mimeType: row.mimeType,
    partNumber,
    partCount: plan.parts.length,
    slots: Array.from({ length: row.nominalSlots }, (_, slot) => {
      const assigned = plan.slotPart.get(slot) ?? null;
      return {
        slot,
        timestampMs: ((slot + 1) * 1000) / 30,
        captured: assigned !== null,
        partNumber: assigned,
        file:
          assigned === null ? null : `frames/frame-${String(slot).padStart(6, "0")}.${extension}`,
        missed: assigned === null,
      };
    }),
  };
}

export async function buildRecordingPart(
  row: RecordingRow,
  plan: ExportPlan,
  partNumber: number,
  appVersion: string,
  fetchFrame: (slot: number) => Promise<RecordingFrameRow>,
): Promise<Blob> {
  const slots = plan.parts[partNumber - 1];
  if (!slots) throw new Error("EXPORT_FAILED");
  const manifestBytes = new TextEncoder().encode(
    `${JSON.stringify(recordingManifest(row, plan, partNumber, appVersion), null, 2)}\n`,
  );
  if (manifestBytes.byteLength > 1024 * 1024) throw new Error("EXPORT_FAILED");
  const chunks: ArrayBuffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const zip = new Zip((error, chunk, final) => {
      if (error) reject(error);
      else {
        chunks.push(chunk.slice().buffer);
        if (final) resolve();
      }
    });
    const manifest = new ZipPassThrough("manifest.json");
    zip.add(manifest);
    manifest.push(manifestBytes, true);
    void (async () => {
      for (const slot of slots) {
        const frame = await fetchFrame(slot),
          extension = frame.mimeType === "image/webp" ? "webp" : "png",
          entry = new ZipPassThrough(`frames/frame-${String(slot).padStart(6, "0")}.${extension}`);
        zip.add(entry);
        entry.push(new Uint8Array(await frame.blob.arrayBuffer()), true);
      }
      zip.end();
    })().catch(reject);
  });
  return new Blob(chunks, { type: "application/zip" });
}

export function withObjectUrl(blob: Blob, click: (url: string) => void): void {
  const url = URL.createObjectURL(blob);
  try {
    click(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
