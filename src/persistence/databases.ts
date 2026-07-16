import Dexie, { type EntityTable, type Table } from "dexie";

export interface PresetRow {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
  builtin: boolean;
  portable: unknown;
}
export interface SceneRow {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
  portable: unknown;
}
export interface CaptureRow {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
  mimeType: "image/png";
  width: number;
  height: number;
  blob: Blob;
}
export type RecordingState = "recording" | "complete" | "interrupted" | "deleting" | "failed";
export interface RecordingRow {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
  state: RecordingState;
  width: number;
  height: number;
  devicePixelRatio: number;
  mimeType: "image/webp" | "image/png";
  nominalSlots: number;
  capturedCount: number;
  missedCount: number;
  lastAttemptedSlot: number;
  startedAtWall: string;
  startedAtMonotonic: number;
  durationMs: number;
  effectiveSlotLimit: number;
  terminalReason: "user" | "duration" | "quota" | "encoder" | "interrupted";
  missedRanges: [number, number][];
}
export interface RecordingFrameRow {
  recordingId: string;
  slot: number;
  timestampMs: number;
  mimeType: "image/webp" | "image/png";
  byteLength: number;
  blob: Blob;
}

export class LibraryDatabase extends Dexie {
  presets!: EntityTable<PresetRow, "id">;
  scenes!: EntityTable<SceneRow, "id">;
  captures!: EntityTable<CaptureRow, "id">;
  recordings!: EntityTable<RecordingRow, "id">;
  constructor() {
    super("galaxia-library");
    this.version(1).stores({
      presets: "&id, normalizedName, updatedAt",
      scenes: "&id, normalizedName, updatedAt",
      captures: "&id, normalizedName, createdAt",
      recordings: "&id, normalizedName, createdAt, state",
    });
  }
}

export class RecordingFrameDatabase extends Dexie {
  frames!: Table<RecordingFrameRow, [string, number]>;
  constructor() {
    super("galaxia-recording-frames");
    this.version(1).stores({ frames: "&[recordingId+slot], recordingId, slot" });
  }
}

export type LibraryErrorCode =
  "DATABASE_UNAVAILABLE" | "QUOTA_EXCEEDED" | "UPGRADE_BLOCKED" | "FUTURE_DATABASE_VERSION";
export class LibraryError extends Error {
  constructor(
    readonly code: LibraryErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function databaseError(error: unknown): LibraryError {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "QuotaExceededError")
    return new LibraryError("QUOTA_EXCEEDED", "Storage quota exceeded.");
  if (name === "VersionError")
    return new LibraryError(
      "FUTURE_DATABASE_VERSION",
      "Library was created by a newer Galaxia version.",
    );
  if (name === "BlockedError")
    return new LibraryError("UPGRADE_BLOCKED", "Library upgrade is blocked.");
  return new LibraryError("DATABASE_UNAVAILABLE", "Browser library storage is unavailable.");
}

export async function openDatabases() {
  const library = new LibraryDatabase(),
    frames = new RecordingFrameDatabase();
  try {
    await Promise.all([library.open(), frames.open()]);
    return { library, frames };
  } catch (error) {
    library.close();
    frames.close();
    throw databaseError(error);
  }
}

export type PersistenceStatus = "granted" | "denied" | "unavailable";
export async function requestDurableStorage(): Promise<PersistenceStatus> {
  const storage = Reflect.get(navigator, "storage") as
    { persist?: () => Promise<boolean> } | undefined;
  if (typeof storage?.persist !== "function") return "unavailable";
  try {
    const persisted = await Promise.race([
      storage.persist(),
      new Promise<null>((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, 2_000);
      }),
    ]);
    return persisted === null ? "unavailable" : persisted ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}
