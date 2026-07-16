import { normalizedName, uniqueLibraryName, validateProductName } from "../domain/names";
import type { LibraryDatabase, RecordingFrameDatabase, RecordingRow } from "./databases";

export class RecordingRepository {
  constructor(
    private readonly library: LibraryDatabase,
    private readonly frames: RecordingFrameDatabase,
  ) {}
  async save(row: Omit<RecordingRow, "name" | "normalizedName"> & { name: string }) {
    return this.library.transaction("rw", this.library.recordings, async () => {
      const names = new Set(
          (await this.library.recordings.toArray()).map((item) => item.normalizedName),
        ),
        name = uniqueLibraryName(row.name, names),
        stored: RecordingRow = { ...row, name, normalizedName: normalizedName(name) };
      await this.library.recordings.add(stored);
      return stored;
    });
  }
  async list() {
    return (await this.library.recordings.toArray())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(({ id, name, createdAt, state, capturedCount, missedCount, terminalReason }) => ({
        id,
        name,
        createdAt,
        state,
        capturedCount,
        missedCount,
        terminalReason,
      }));
  }
  async detail(id: string) {
    const row = await this.library.recordings.get(id);
    if (!row) throw new Error("LIBRARY_ITEM_NOT_FOUND");
    const firstFrame = await this.frames.frames.where("recordingId").equals(id).sortBy("slot");
    return { row, preview: firstFrame[0] ?? null };
  }
  async adjacent(id: string, slot: number, direction: -1 | 1) {
    const rows = await this.frames.frames.where("recordingId").equals(id).sortBy("slot"),
      ordered = direction === 1 ? rows : [...rows].reverse();
    return (
      ordered.find((frame) => (direction === 1 ? frame.slot > slot : frame.slot < slot)) ?? null
    );
  }
  async rename(id: string, desired: string) {
    const name = validateProductName(desired),
      collision = await this.library.recordings
        .where("normalizedName")
        .equals(normalizedName(name))
        .first();
    if (collision && collision.id !== id) throw new Error("NAME_COLLISION");
    if (
      (await this.library.recordings.update(id, {
        name,
        normalizedName: normalizedName(name),
        updatedAt: new Date().toISOString(),
      })) === 0
    )
      throw new Error("LIBRARY_ITEM_NOT_FOUND");
    return name;
  }
  async delete(
    id: string,
    yieldTask: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
  ) {
    if ((await this.library.recordings.update(id, { state: "deleting" })) === 0) return;
    for (;;) {
      const keys = (
        await this.frames.frames.where("recordingId").equals(id).limit(100).toArray()
      ).map((frame) => [frame.recordingId, frame.slot] as [string, number]);
      if (keys.length === 0) break;
      await this.frames.frames.bulkDelete(keys);
      await yieldTask();
    }
    await this.library.recordings.delete(id);
  }
}
