import { Zip, ZipPassThrough } from "fflate";

const WIDTH = 1920;
const HEIGHT = 1080;
const FRAME_COUNT = 300;
const ZIP_FRAME_BUDGET = 63 * 1024 * 1024;
const ZIP_PART_CAP = 64 * 1024 * 1024;

interface StoredFrame {
  slot: number;
  byteLength: number;
  mimeType: string;
  blob: Blob;
}

export interface CaptureStorageReport {
  width: number;
  height: number;
  frameCount: number;
  webpSupported: boolean;
  mimeType: string;
  p95BlobBytes: number;
  p95ToBlobMs: number;
  p95IndexedDbWriteMs: number;
  maximumInFlight: number;
  missedSlotsWhenSaturated: number;
  measuredPartCount: number;
  measuredLargestPartBytes: number;
  streamedSpikePartBytes: number;
  projectedFullSlotPartCount: number;
  peakOwnedBytes: number;
  fallbackClicks: number;
  spikeDataDeleted: boolean;
}

function p95(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}

function canvas() {
  const result = document.createElement("canvas");
  result.width = WIDTH;
  result.height = HEIGHT;
  return result;
}

function paint(target: HTMLCanvasElement, slot: number) {
  const context = target.getContext("2d", { alpha: false });
  if (!context) throw new Error("Capture proof requires a 2D canvas.");
  context.fillStyle = "rgb(5,8,20)";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const gradient = context.createRadialGradient(960, 540, 8, 960, 540, 760);
  gradient.addColorStop(0, `hsl(${String(slot % 360)} 75% 42%)`);
  gradient.addColorStop(0.45, "rgb(18,24,48)");
  gradient.addColorStop(1, "rgb(5,8,20)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  for (let star = 0; star < 900; star += 1) {
    const x = (star * 1543 + slot * 37) % WIDTH;
    const y = (star * 811 + slot * 19) % HEIGHT;
    const radius = 1 + ((star + slot) % 3);
    context.fillStyle = `rgba(${String(150 + (star % 106))},${String(170 + ((star * 3) % 86))},255,0.85)`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = "rgba(210,225,255,0.35)";
  context.lineWidth = 3;
  context.beginPath();
  for (let point = 0; point <= 360; point += 1) {
    const angle = point * 0.09 + slot * 0.01;
    const radius = 2.2 * point;
    const x = 960 + Math.cos(angle) * radius;
    const y = 540 + Math.sin(angle) * radius * 0.55;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
}

function encode(target: HTMLCanvasElement, mimeType: string) {
  const started = performance.now();
  return new Promise<{ blob: Blob; latencyMs: number }>((resolve, reject) => {
    target.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Capture proof encoder returned null."));
          return;
        }
        resolve({ blob, latencyMs: performance.now() - started });
      },
      mimeType,
      0.9,
    );
  });
}

class TwoTargetPool {
  private readonly targets = [canvas(), canvas()];
  private readonly busy = [false, false];
  inFlight = 0;
  maximumInFlight = 0;

  tryCapture(slot: number, mimeType: string) {
    const index = this.busy.findIndex((value) => !value);
    if (index < 0) return null;
    const target = this.targets[index];
    if (!target) throw new Error("Capture target is missing.");
    this.busy[index] = true;
    this.inFlight += 1;
    this.maximumInFlight = Math.max(this.maximumInFlight, this.inFlight);
    paint(target, slot);
    return encode(target, mimeType).finally(() => {
      this.busy[index] = false;
      this.inFlight -= 1;
    });
  }
}

function openDatabase(name: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("frames", { keyPath: "slot" });
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB open failed."));
    };
  });
}

function put(db: IDBDatabase, frame: StoredFrame) {
  const started = performance.now();
  return new Promise<number>((resolve, reject) => {
    const transaction = db.transaction("frames", "readwrite");
    transaction.objectStore("frames").put(frame);
    transaction.oncomplete = () => {
      resolve(performance.now() - started);
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB write failed."));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB write aborted."));
    };
  });
}

function allFrames(db: IDBDatabase) {
  return new Promise<StoredFrame[]>((resolve, reject) => {
    const request = db.transaction("frames", "readonly").objectStore("frames").getAll();
    request.onsuccess = () => {
      resolve(request.result as StoredFrame[]);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB read failed."));
    };
  });
}

function deleteDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB deletion failed."));
    };
    request.onblocked = () => {
      reject(new Error("IndexedDB deletion was blocked."));
    };
  });
}

function assignParts(frames: StoredFrame[]) {
  const parts: StoredFrame[][] = [[]];
  let bytes = 0;
  for (const frame of frames) {
    if (frame.byteLength > ZIP_FRAME_BUDGET)
      throw new Error("A frame exceeds the ZIP part frame budget.");
    if (bytes + frame.byteLength > ZIP_FRAME_BUDGET) {
      parts.push([]);
      bytes = 0;
    }
    parts.at(-1)?.push(frame);
    bytes += frame.byteLength;
  }
  return parts;
}

async function streamPart(frames: StoredFrame[], partNumber: number, partCount: number) {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const completed = new Promise<void>((resolve, reject) => {
    const zip = new Zip((error, chunk, final) => {
      if (error) {
        reject(error);
        return;
      }
      chunks.push(chunk);
      total += chunk.byteLength;
      if (final) resolve();
    });
    const manifest = new ZipPassThrough("manifest.json");
    zip.add(manifest);
    manifest.push(
      new TextEncoder().encode(
        `${JSON.stringify({ kind: "galaxia-recording", schemaVersion: 1, partNumber, partCount, slots: frames.map((frame) => frame.slot) }, null, 2)}\n`,
      ),
      true,
    );
    void (async () => {
      for (const frame of frames) {
        const extension = frame.mimeType === "image/webp" ? "webp" : "png";
        const entry = new ZipPassThrough(
          `frames/frame-${String(frame.slot).padStart(6, "0")}.${extension}`,
        );
        zip.add(entry);
        entry.push(new Uint8Array(await frame.blob.arrayBuffer()), true);
      }
      zip.end();
    })().catch(reject);
  });
  await completed;
  if (total > ZIP_PART_CAP) throw new Error("Streaming ZIP exceeded the 64 MiB part cap.");
  return { byteLength: total, chunks };
}

export class ExplicitPartFallback {
  clicks = 0;
  constructor(private readonly buildPart: (partNumber: number) => Promise<void>) {}
  async click(partNumber: number) {
    this.clicks += 1;
    await this.buildPart(partNumber);
  }
}

export async function runCaptureStorageProof(): Promise<CaptureStorageReport> {
  const databaseName = `galaxia-recording-frames-proof-${String(Date.now())}`;
  const supportCanvas = document.createElement("canvas");
  supportCanvas.width = 32;
  supportCanvas.height = 32;
  paintSupport(supportCanvas);
  const webp = await encode(supportCanvas, "image/webp");
  const webpSupported = webp.blob.type === "image/webp" && webp.blob.size > 0;
  const mimeType = webpSupported ? "image/webp" : "image/png";
  const pool = new TwoTargetPool();
  const sizes: number[] = [];
  const encodeLatencies: number[] = [];
  const writeLatencies: number[] = [];
  let database: IDBDatabase | null = null;
  let spikeDataDeleted = false;
  try {
    database = await openDatabase(databaseName);
    const pending = new Set<Promise<void>>();
    let nextSlot = 0;
    while (nextSlot < FRAME_COUNT || pending.size > 0) {
      while (nextSlot < FRAME_COUNT && pending.size < 2) {
        const slot = nextSlot;
        const capture = pool.tryCapture(slot, mimeType);
        if (!capture) break;
        nextSlot += 1;
        const operation = capture.then(async ({ blob, latencyMs }) => {
          sizes.push(blob.size);
          encodeLatencies.push(latencyMs);
          if (!database) throw new Error("Capture database closed early.");
          writeLatencies.push(
            await put(database, { slot, byteLength: blob.size, mimeType: blob.type, blob }),
          );
        });
        pending.add(operation);
        void operation.finally(() => pending.delete(operation));
      }
      if (pending.size > 0) await Promise.race(pending);
    }

    const saturationPool = new TwoTargetPool();
    const first = saturationPool.tryCapture(10_000, mimeType);
    const second = saturationPool.tryCapture(10_001, mimeType);
    const third = saturationPool.tryCapture(10_002, mimeType);
    const missedSlotsWhenSaturated = third === null ? 1 : 0;
    await Promise.all([first, second].filter((value) => value !== null));

    const frames = (await allFrames(database)).sort((left, right) => left.slot - right.slot);
    const parts = assignParts(frames);
    const partSizes: number[] = [];
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!part) throw new Error("ZIP plan contains an empty part reference.");
      partSizes.push((await streamPart(part, index + 1, parts.length)).byteLength);
    }
    const spikeFrames: StoredFrame[] = [];
    let spikeInputBytes = 0;
    for (let index = 0; ; index += 1) {
      const source = frames[index % frames.length];
      if (!source || spikeInputBytes + source.byteLength > ZIP_FRAME_BUDGET) break;
      spikeFrames.push({ ...source, slot: FRAME_COUNT + index });
      spikeInputBytes += source.byteLength;
    }
    const streamedSpikePartBytes = (await streamPart(spikeFrames, 1, 1)).byteLength;
    const fallback = new ExplicitPartFallback(async (partNumber) => {
      const part = parts[partNumber - 1];
      if (!part) throw new Error("Requested ZIP part does not exist.");
      await streamPart(part, partNumber, parts.length);
    });
    await fallback.click(1);
    const p95BlobBytes = p95(sizes);
    const measuredLargestPartBytes = Math.max(...partSizes);
    const peakOwnedBytes = 2 * WIDTH * HEIGHT * 4 + streamedSpikePartBytes + 3 * p95BlobBytes;
    database.close();
    database = null;
    await deleteDatabase(databaseName);
    spikeDataDeleted = true;
    return {
      width: WIDTH,
      height: HEIGHT,
      frameCount: frames.length,
      webpSupported,
      mimeType,
      p95BlobBytes,
      p95ToBlobMs: p95(encodeLatencies),
      p95IndexedDbWriteMs: p95(writeLatencies),
      maximumInFlight: pool.maximumInFlight,
      missedSlotsWhenSaturated,
      measuredPartCount: parts.length,
      measuredLargestPartBytes,
      streamedSpikePartBytes,
      projectedFullSlotPartCount: Math.ceil((3600 * p95BlobBytes) / ZIP_FRAME_BUDGET),
      peakOwnedBytes,
      fallbackClicks: fallback.clicks,
      spikeDataDeleted,
    };
  } finally {
    database?.close();
    if (!spikeDataDeleted) await deleteDatabase(databaseName).catch(() => undefined);
  }
}

function paintSupport(target: HTMLCanvasElement) {
  const context = target.getContext("2d");
  if (!context) throw new Error("WebP support canvas is unavailable.");
  context.fillStyle = "#123456";
  context.fillRect(0, 0, target.width, target.height);
}
