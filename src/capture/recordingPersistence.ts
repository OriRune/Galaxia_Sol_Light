import type {
  LibraryDatabase,
  RecordingFrameDatabase,
  RecordingRow,
} from "../persistence/databases";

export type RecordingTerminalReason = "user" | "duration" | "quota" | "encoder" | "interrupted";
export function compactMissed(
  nominalSlots: number,
  capturedSlots: ReadonlySet<number>,
): [number, number][] {
  const result: [number, number][] = [];
  let start: number | null = null;
  for (let slot = 0; slot < nominalSlots; slot += 1) {
    if (!capturedSlots.has(slot) && start === null) start = slot;
    if (capturedSlots.has(slot) && start !== null) {
      result.push([start, slot - 1]);
      start = null;
    }
  }
  if (start !== null) result.push([start, nominalSlots - 1]);
  return result;
}

export class RecordingPersistence {
  constructor(
    private readonly library: LibraryDatabase,
    private readonly frames: RecordingFrameDatabase,
  ) {}
  async attemptMetadata(
    recordingId: string,
    candidate: number,
    immediatelyMissed: [number, number] | null,
  ) {
    await this.library.transaction("rw", this.library.recordings, async () => {
      const row = await this.library.recordings.get(recordingId);
      if (row?.state !== "recording") throw new Error("RECORDING_UNAVAILABLE");
      const missedRanges = [...row.missedRanges];
      if (immediatelyMissed) {
        const previous = missedRanges.at(-1);
        if (previous && previous[1] + 1 === immediatelyMissed[0])
          previous[1] = immediatelyMissed[1];
        else missedRanges.push([...immediatelyMissed]);
      }
      await this.library.recordings.update(recordingId, {
        lastAttemptedSlot: candidate,
        nominalSlots: candidate + 1,
        missedRanges,
        missedCount: missedRanges.reduce((sum, [start, end]) => sum + end - start + 1, 0),
      });
    });
  }
  async writeFrame(
    recordingId: string,
    slot: number,
    timestampMs: number,
    blob: Blob,
  ): Promise<void> {
    await this.frames.frames.add({
      recordingId,
      slot,
      timestampMs,
      mimeType: blob.type === "image/webp" ? "image/webp" : "image/png",
      byteLength: blob.size,
      blob,
    });
    await this.library.transaction("rw", this.library.recordings, async () => {
      const row = await this.library.recordings.get(recordingId);
      if (!row) throw new Error("RECORDING_UNAVAILABLE");
      await this.library.recordings.update(recordingId, { capturedCount: row.capturedCount + 1 });
    });
  }
  async encoderMiss(recordingId: string, slot: number): Promise<void> {
    await this.library.transaction("rw", this.library.recordings, async () => {
      const row = await this.library.recordings.get(recordingId);
      if (!row) throw new Error("RECORDING_UNAVAILABLE");
      const slots = new Set<number>();
      for (const [start, end] of row.missedRanges)
        for (let value = start; value <= end; value += 1) slots.add(value);
      slots.add(slot);
      const ranges = compactMissed(
        row.nominalSlots,
        new Set(
          Array.from({ length: row.nominalSlots }, (_, value) => value).filter(
            (value) => !slots.has(value),
          ),
        ),
      );
      await this.library.recordings.update(recordingId, {
        missedRanges: ranges,
        missedCount: slots.size,
      });
    });
  }
  async finalize(recordingId: string, reason: RecordingTerminalReason): Promise<RecordingRow> {
    const row = await this.library.recordings.get(recordingId);
    if (!row) throw new Error("RECORDING_UNAVAILABLE");
    const persisted = await this.frames.frames.where("recordingId").equals(recordingId).toArray(),
      largestFrame = persisted.reduce((maximum, frame) => Math.max(maximum, frame.slot), -1),
      nominalSlots = Math.max(row.lastAttemptedSlot, largestFrame) + 1,
      captured = new Set(persisted.map((frame) => frame.slot)),
      update: Partial<RecordingRow> = {
        state: reason === "user" || reason === "duration" ? "complete" : "failed",
        terminalReason: reason,
        nominalSlots,
        capturedCount: captured.size,
        missedCount: nominalSlots - captured.size,
        missedRanges: compactMissed(nominalSlots, captured),
        durationMs: (nominalSlots * 1000) / 30,
        updatedAt: new Date().toISOString(),
      };
    await this.library.recordings.update(recordingId, update);
    const finalized = await this.library.recordings.get(recordingId);
    if (!finalized) throw new Error("RECORDING_UNAVAILABLE");
    return finalized;
  }
}
