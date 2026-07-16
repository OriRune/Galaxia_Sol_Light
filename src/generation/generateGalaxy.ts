import type { GalaxyGenerationConfig } from "../domain/types";
import { generateBarredSpiral } from "./generators/barredSpiral";
import { generateDwarf } from "./generators/dwarf";
import { generateElliptical } from "./generators/elliptical";
import { generateIrregular } from "./generators/irregular";
import { generateSpiral } from "./generators/spiral";

export function generateGalaxy(generation: Readonly<GalaxyGenerationConfig>) {
  switch (generation.type) {
    case "spiral":
      return generateSpiral(generation);
    case "barredSpiral":
      return generateBarredSpiral(generation);
    case "elliptical":
      return generateElliptical(generation);
    case "irregular":
      return generateIrregular(generation);
    case "dwarf":
      return generateDwarf(generation);
  }
}
