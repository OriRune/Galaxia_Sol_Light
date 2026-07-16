import { readFile } from "node:fs/promises";
import { installSineTable } from "../../src/generation/sineTable";

const path = new URL("../../src/generation/generated/sine-f32.bin", import.meta.url);
const bytes = await readFile(path);
await installSineTable(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
