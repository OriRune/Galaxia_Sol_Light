import { readFile } from "node:fs/promises";
import process from "node:process";

function normalized(parsed) {
  if (!parsed || !Array.isArray(parsed.fixtures)) throw new Error("Invalid digest JSON.");
  return [...parsed.fixtures]
    .map((fixture) => ({ id: String(fixture.id), digest: String(fixture.digest) }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

const [, , leftPath, rightPath] = process.argv;
if (!leftPath || !rightPath) {
  throw new Error("Usage: node scripts/compare-generation-digests.mjs LEFT.json RIGHT.json");
}
const left = normalized(JSON.parse(await readFile(leftPath, "utf8")));
const right = normalized(JSON.parse(await readFile(rightPath, "utf8")));
if (left.length !== right.length)
  throw new Error(`Fixture count differs: ${left.length} vs ${right.length}`);
for (let index = 0; index < left.length; index += 1) {
  const leftFixture = left[index];
  const rightFixture = right[index];
  if (!leftFixture || !rightFixture) throw new Error("Fixture list ended unexpectedly.");
  if (leftFixture.id !== rightFixture.id || leftFixture.digest !== rightFixture.digest) {
    throw new Error(
      `Digest mismatch for ${leftFixture.id}: ${leftFixture.digest} vs ${rightFixture.digest}`,
    );
  }
}
