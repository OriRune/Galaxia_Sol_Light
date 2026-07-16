import { boundedExportName } from "../domain/names";
import type { CaptureRow } from "../persistence/databases";
import type { LibraryRepository } from "../persistence/libraryRepository";

interface ArtworkRenderer {
  renderArtworkTo: (target: HTMLCanvasElement) => void;
}
export interface ScreenshotResult {
  row: CaptureRow;
  downloadName: string;
}
export class ScreenshotService {
  constructor(
    private readonly renderer: ArtworkRenderer,
    private readonly target: HTMLCanvasElement,
    private readonly repository: LibraryRepository,
  ) {}
  async capture(id: string, desiredName: string, now = new Date()): Promise<ScreenshotResult> {
    this.renderer.renderArtworkTo(this.target);
    const blob = await new Promise<Blob | null>((resolve) => {
      this.target.toBlob(resolve, "image/png");
    });
    if (!blob) throw new Error("CAPTURE_ENCODER_FAILED");
    const timestamp = now.toISOString(),
      row = await this.repository.saveCapture({
        id,
        name: desiredName,
        createdAt: timestamp,
        updatedAt: timestamp,
        mimeType: "image/png",
        width: this.target.width,
        height: this.target.height,
        blob,
      });
    return { row, downloadName: boundedExportName(row.name, ".png") };
  }
  async preview(id: string): Promise<Blob> {
    const row = await this.repository.getCapture(id);
    if (!row) throw new Error("LIBRARY_ITEM_NOT_FOUND");
    return row.blob;
  }
}
