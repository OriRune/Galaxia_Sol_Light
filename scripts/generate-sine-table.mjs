import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const entryCount = 65_536;
const bytes = new Uint8Array(entryCount * Float32Array.BYTES_PER_ELEMENT);
const view = new DataView(bytes.buffer);
for (let index = 0; index < entryCount; index += 1) {
  const value = Math.fround(Math.sin((2 * Math.PI * index) / entryCount));
  view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, true);
}
const output = path.resolve("src/generation/generated/sine-f32.bin");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, bytes);
console.log(createHash("sha256").update(bytes).digest("hex"));
