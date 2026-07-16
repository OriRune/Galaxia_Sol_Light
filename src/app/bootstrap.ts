import sineTableUrl from "../generation/generated/sine-f32.bin?url";
import { installSineTable } from "../generation/sineTable";

export async function bootstrapDeterministicArtifacts() {
  const response = await fetch(sineTableUrl);
  if (!response.ok) throw new Error("SINE_TABLE_LOAD_FAILED");
  await installSineTable(await response.arrayBuffer());
}
