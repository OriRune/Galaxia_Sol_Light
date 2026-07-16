export interface DigestibleGalaxy {
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  red: Uint8Array;
  green: Uint8Array;
  blue: Uint8Array;
  alpha: Uint8Array;
  pointSize: Uint8Array;
}

const HEADER = new TextEncoder().encode("GALAXIA-GEN-1");

export function canonicalGenerationBytes(galaxy: DigestibleGalaxy) {
  const starCount = galaxy.x.length;
  const arrays = [galaxy.y, galaxy.vx, galaxy.vy];
  if (arrays.some((array) => array.length !== starCount))
    throw new Error("Generation array lengths differ.");
  const styles = [galaxy.red, galaxy.green, galaxy.blue, galaxy.alpha, galaxy.pointSize];
  if (styles.some((array) => array.length !== starCount))
    throw new Error("Style array lengths differ.");
  const byteLength = HEADER.length + 4 + starCount * (4 * 4 + 5);
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  bytes.set(HEADER, offset);
  offset += HEADER.length;
  view.setUint32(offset, starCount, true);
  offset += 4;
  for (const array of [galaxy.x, galaxy.y, galaxy.vx, galaxy.vy]) {
    for (const value of array) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
  }
  for (const style of styles) {
    bytes.set(style, offset);
    offset += style.length;
  }
  return bytes;
}

export async function canonicalGenerationDigest(galaxy: DigestibleGalaxy) {
  const bytes = canonicalGenerationBytes(galaxy);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}
