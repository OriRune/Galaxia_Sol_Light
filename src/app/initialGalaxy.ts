import { FIRST_LIGHT } from "../domain/defaults";
import type { GalaxyRecord } from "../domain/types";

export function initialGalaxyForRuntime(e2eEnabled: boolean, fixture: string | null) {
  return e2eEnabled && fixture === "low"
    ? { ...FIRST_LIGHT, generation: { ...FIRST_LIGHT.generation, starCount: 500 } }
    : FIRST_LIGHT;
}

export function initialGalaxiesForRuntime(testHooksEnabled: boolean, fixture: string | null) {
  if (!testHooksEnabled || fixture !== "high")
    return [initialGalaxyForRuntime(testHooksEnabled, fixture)];
  const types = ["spiral", "barredSpiral", "elliptical", "irregular", "dwarf"] as const;
  return types.map((type, index): GalaxyRecord => {
    const angle = (index / types.length) * Math.PI * 2;
    return {
      id: `high-${String(index + 1)}`,
      name: null,
      generation: {
        ...FIRST_LIGHT.generation,
        type,
        seed: index + 1,
        starCount: 12_000,
        armCount: type === "spiral" || type === "barredSpiral" ? 2 : null,
      },
      position: { x: Math.cos(angle) * 200, y: Math.sin(angle) * 200 },
      bulkVelocity: { x: -Math.sin(angle) * 2, y: Math.cos(angle) * 2 },
    };
  });
}
