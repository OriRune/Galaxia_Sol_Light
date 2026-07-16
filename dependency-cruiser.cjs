/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "domain-is-pure",
      severity: "error",
      from: { path: "^src/domain" },
      to: { path: "^src/(app|features|rendering|persistence)" },
    },
    {
      name: "generation-boundary",
      severity: "error",
      from: { path: "^src/generation" },
      to: { pathNot: "^src/(domain|generation)(/|$)" },
    },
    {
      name: "simulation-boundary",
      severity: "error",
      from: { path: "^src/simulation/(?!worker\\.ts$)" },
      to: { pathNot: "^src/(domain|generation|simulation)(/|$)" },
    },
    {
      name: "rendering-no-features",
      severity: "error",
      from: { path: "^src/rendering" },
      to: { path: "^src/features" },
    },
    {
      name: "persistence-boundary",
      severity: "error",
      from: { path: "^src/persistence" },
      to: { path: "^src/(features|rendering)" },
    },
    {
      name: "worker-entry-not-imported",
      severity: "error",
      from: { pathNot: "^$" },
      to: { path: "^src/simulation/worker\\.ts$" },
    },
  ],
  options: { doNotFollow: { path: "node_modules" }, tsConfig: { fileName: "tsconfig.app.json" } },
};
