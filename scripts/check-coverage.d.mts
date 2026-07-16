export interface CoverageFile {
  s: Record<string, number>;
  b: Record<string, number[]>;
  f: Record<string, number>;
}

export function evaluateCoverage(
  report: Record<string, CoverageFile>,
  requiredGroups?: Set<string>,
): { failed: boolean; rows: string[] };
