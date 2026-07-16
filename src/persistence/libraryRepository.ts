import { normalizedName, uniqueLibraryName, validateProductName } from "../domain/names";
import { presetFileV1Schema, sceneFileV1Schema } from "../domain/schemas";
import type { CaptureRow, LibraryDatabase, PresetRow, SceneRow } from "./databases";

export type LibraryKind = "preset" | "scene" | "capture";
export interface LibrarySummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  builtin: boolean;
}

export class LibraryRepository {
  constructor(private readonly database: LibraryDatabase) {}

  async uniqueName(kind: LibraryKind, desired: string): Promise<string> {
    const keys = await this.table(kind).toCollection().primaryKeys();
    const rows = await this.table(kind).bulkGet(keys);
    return uniqueLibraryName(
      desired,
      new Set(rows.flatMap((row) => (row ? [row.normalizedName] : []))),
    );
  }

  async savePreset(row: Omit<PresetRow, "name" | "normalizedName"> & { name: string }) {
    return this.database.transaction("rw", this.database.presets, async () => {
      const name = await this.uniqueName("preset", row.name);
      const portable = presetFileV1Schema.parse(row.portable),
        stored: PresetRow = {
          ...row,
          name,
          normalizedName: normalizedName(name),
          portable: { ...portable, id: row.id, name },
        };
      await this.database.presets.add(stored);
      return stored;
    });
  }

  async saveScene(row: Omit<SceneRow, "name" | "normalizedName"> & { name: string }) {
    return this.database.transaction("rw", this.database.scenes, async () => {
      const name = await this.uniqueName("scene", row.name);
      const portable = sceneFileV1Schema.parse(row.portable),
        stored: SceneRow = {
          ...row,
          name,
          normalizedName: normalizedName(name),
          portable: { ...portable, id: row.id, name },
        };
      await this.database.scenes.add(stored);
      return stored;
    });
  }

  async saveCapture(row: Omit<CaptureRow, "name" | "normalizedName"> & { name: string }) {
    return this.database.transaction("rw", this.database.captures, async () => {
      const name = await this.uniqueName("capture", row.name);
      const stored: CaptureRow = { ...row, name, normalizedName: normalizedName(name) };
      await this.database.captures.add(stored);
      return stored;
    });
  }

  async getCapture(id: string): Promise<CaptureRow | null> {
    return (await this.database.captures.get(id)) ?? null;
  }

  async rename(kind: LibraryKind, id: string, desired: string): Promise<string> {
    return this.database.transaction("rw", this.table(kind), async () => {
      const row = await this.table(kind).get(id);
      if (!row) throw new Error("LIBRARY_ITEM_NOT_FOUND");
      if ("builtin" in row && row.builtin) throw new Error("BUILTIN_PROTECTED");
      const trimmed = validateProductName(desired),
        collision = await this.table(kind)
          .where("normalizedName")
          .equals(normalizedName(trimmed))
          .first();
      if (collision && collision.id !== id) throw new Error("NAME_COLLISION");
      const portable =
        kind === "preset"
          ? { ...presetFileV1Schema.parse("portable" in row ? row.portable : null), name: trimmed }
          : kind === "scene"
            ? { ...sceneFileV1Schema.parse("portable" in row ? row.portable : null), name: trimmed }
            : undefined;
      await this.table(kind).update(id, {
        name: trimmed,
        normalizedName: normalizedName(trimmed),
        updatedAt: new Date().toISOString(),
        ...(portable ? { portable } : {}),
      });
      return trimmed;
    });
  }

  async delete(kind: LibraryKind, id: string): Promise<void> {
    await this.database.transaction("rw", this.table(kind), async () => {
      const row = await this.table(kind).get(id);
      if (!row) return;
      if ("builtin" in row && row.builtin) throw new Error("BUILTIN_PROTECTED");
      await this.table(kind).delete(id);
    });
  }

  async list(kind: LibraryKind): Promise<LibrarySummary[]> {
    const rows = await this.table(kind).toArray();
    rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      builtin: "builtin" in row && row.builtin === true,
    }));
  }

  private table(kind: LibraryKind) {
    if (kind === "preset") return this.database.presets;
    if (kind === "scene") return this.database.scenes;
    return this.database.captures;
  }
}
