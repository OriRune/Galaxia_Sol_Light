import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenshotService } from "../../src/capture/screenshotService";
import { LibraryDatabase } from "../../src/persistence/databases";
import { LibraryRepository } from "../../src/persistence/libraryRepository";

let database: LibraryDatabase, repository: LibraryRepository;
beforeEach(async () => {
  database = new LibraryDatabase();
  await database.open();
  repository = new LibraryRepository(database);
});
afterEach(async () => {
  database.close();
  await Dexie.delete("galaxia-library");
});
const target = (blob: Blob | null) =>
  ({
    width: 640,
    height: 480,
    toBlob: (callback: BlobCallback) => {
      callback(blob);
    },
  }) as HTMLCanvasElement;
describe("screenshot service", () => {
  it("renders artwork, stores unique discoverable rows, previews and names downloads", async () => {
    const renderer = { renderArtworkTo: vi.fn() },
      service = new ScreenshotService(
        renderer,
        target(new Blob(["png"], { type: "image/png" })),
        repository,
      );
    const first = await service.capture("a", "CON", new Date("2026-01-01T00:00:00Z"));
    const second = await service.capture("b", "CON", new Date("2026-01-01T00:00:01Z"));
    expect(renderer.renderArtworkTo).toHaveBeenCalledTimes(2);
    expect(first.downloadName).toBe("_CON.png");
    expect(second.row.name).toBe("CON (2)");
    expect(await service.preview("a")).toBeInstanceOf(Blob);
    expect(await repository.list("capture")).toHaveLength(2);
  });
  it("saves nothing when toBlob returns null", async () => {
    const service = new ScreenshotService({ renderArtworkTo: vi.fn() }, target(null), repository);
    await expect(service.capture("a", "Capture")).rejects.toThrow("CAPTURE_ENCODER_FAILED");
    expect(await database.captures.count()).toBe(0);
  });
});
