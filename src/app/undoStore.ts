import type { DraftGalaxy, Mode, PerformanceLevel, RandomCategory } from "../domain/types";

export const UNDOABLE_ACTIONS = [
  "addGalaxy",
  "deleteGalaxy",
  "commitGalaxy",
  "moveGalaxy",
  "bulkVelocity",
  "applyPreset",
  "generateRandom",
  "enterSingleReplacingScene",
  "loadScene",
  "gravity",
  "playbackSpeed",
  "performanceLevel",
  "trails",
] as const;
export type UndoActionKind = (typeof UNDOABLE_ACTIONS)[number];

export interface UndoUiSnapshot {
  mode: Mode;
  draft: DraftGalaxy;
  randomCategory: RandomCategory;
  randomSeed: number;
  selectedGalaxyId: string | null;
  performanceLevel: PerformanceLevel;
  trails: boolean;
}
export interface UndoEntry {
  id?: string;
  actionKind?: UndoActionKind;
  workerSnapshotId?: string;
  snapshotId: string;
  description?: string;
  uiSnapshot: unknown;
  createdAtMonotonic?: number;
}
export class UndoStore {
  private entries: UndoEntry[] = [];
  constructor(private readonly release: (snapshotId: string) => void | Promise<void>) {}
  get depth(): number {
    return this.entries.length;
  }
  push(entry: UndoEntry): void {
    this.entries.push(entry);
    if (this.entries.length > 20) {
      const oldest = this.entries.shift();
      if (oldest) void this.release(oldest.snapshotId);
    }
  }
  peek(): UndoEntry | null {
    return this.entries.at(-1) ?? null;
  }
  pop(): UndoEntry | null {
    return this.entries.pop() ?? null;
  }
  clear(): void {
    for (const entry of this.entries) void this.release(entry.snapshotId);
    this.entries = [];
  }
}

export interface UndoClient {
  command: (type: "PAUSE", payload: Record<string, never>) => Promise<unknown>;
  mutation: (type: "RESTORE_UNDO_SNAPSHOT", payload: { snapshotId: string }) => Promise<unknown>;
  release: (snapshotId: string) => Promise<unknown>;
}

export class UndoCoordinator {
  private locked = false;
  constructor(
    private readonly store: UndoStore,
    private readonly client: UndoClient,
    private readonly restoreUi: (snapshot: UndoUiSnapshot) => void,
  ) {}
  get pending(): boolean {
    return this.locked;
  }
  async undo(): Promise<boolean> {
    const entry = this.store.peek();
    if (!entry || this.locked) return false;
    this.locked = true;
    try {
      await this.client.command("PAUSE", {});
      await this.client.mutation("RESTORE_UNDO_SNAPSHOT", { snapshotId: entry.snapshotId });
      this.restoreUi(entry.uiSnapshot as UndoUiSnapshot);
      this.store.pop();
      await this.client.release(entry.snapshotId);
      return true;
    } finally {
      this.locked = false;
    }
  }
}
