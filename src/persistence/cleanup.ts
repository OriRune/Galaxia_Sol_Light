import type { LibraryDatabase, RecordingFrameDatabase, RecordingRow } from "./databases";

function missedRanges(lastAttemptedSlot: number, present: ReadonlySet<number>): [number, number][] {
  const ranges: [number, number][] = [];
  let start: number | null = null;
  for (let slot = 0; slot <= lastAttemptedSlot; slot += 1) {
    if (!present.has(slot) && start === null) start = slot;
    if (present.has(slot) && start !== null) {
      ranges.push([start, slot - 1]);
      start = null;
    }
  }
  if (start !== null) ranges.push([start, lastAttemptedSlot]);
  return ranges;
}

export async function cleanupRecordingStorage(
  library: LibraryDatabase,
  frameDatabase: RecordingFrameDatabase,
  yieldTask: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
): Promise<void> {
  const rows = await library.recordings.toArray();
  for (const row of rows) {
    if (row.state === "deleting") {
      await frameDatabase.frames.where("recordingId").equals(row.id).delete();
      await library.recordings.delete(row.id);
      continue;
    }
    if (row.state === "recording") {
      const frames = await frameDatabase.frames.where("recordingId").equals(row.id).toArray(),
        slots = new Set(frames.map((frame) => frame.slot)),
        ranges = missedRanges(row.lastAttemptedSlot, slots),
        update: Partial<RecordingRow> = {
          state: "interrupted",
          terminalReason: "interrupted",
          capturedCount: frames.length,
          missedRanges: ranges,
          missedCount: ranges.reduce((sum, [start, end]) => sum + end - start + 1, 0),
          updatedAt: new Date().toISOString(),
        };
      await library.recordings.update(row.id, update);
    }
  }
  const liveIds = new Set((await library.recordings.toArray()).map((row) => row.id));
  for (;;) {
    const orphanKeys = (await frameDatabase.frames.toArray())
      .filter((frame) => !liveIds.has(frame.recordingId))
      .slice(0, 100)
      .map((frame) => [frame.recordingId, frame.slot] as [string, number]);
    if (orphanKeys.length === 0) break;
    await frameDatabase.frames.bulkDelete(orphanKeys);
    await yieldTask();
  }
}
