import { SINE_TABLE_BYTES, SINE_TABLE_DIGEST } from "./sineTableDigest";

let table: Float32Array | null = null;

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function installSineTable(buffer: ArrayBuffer) {
  if (buffer.byteLength !== SINE_TABLE_BYTES) throw new Error("SINE_TABLE_INVALID_LENGTH");
  const digest = hex(await crypto.subtle.digest("SHA-256", buffer));
  if (digest !== SINE_TABLE_DIGEST) throw new Error("SINE_TABLE_INVALID_DIGEST");
  const view = new DataView(buffer);
  const installed = new Float32Array(SINE_TABLE_BYTES / Float32Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < installed.length; index += 1) {
    installed[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
  }
  table = installed;
}

export function sinTurn(turns: number) {
  if (!table) throw new Error("SINE_TABLE_NOT_READY");
  const reduced = turns - Math.floor(turns);
  const scaled = Math.fround(reduced * 65_536);
  const base = Math.floor(scaled);
  const i0 = base & 65_535;
  const i1 = (i0 + 1) & 65_535;
  const fraction = Math.fround(scaled - base);
  const first = table[i0] ?? 0;
  const second = table[i1] ?? 0;
  return Math.fround(first + Math.fround(fraction * Math.fround(second - first)));
}

export function cosTurn(turns: number) {
  return sinTurn(turns + 0.25);
}
