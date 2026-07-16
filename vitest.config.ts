import { playwright } from "@vitest/browser-playwright";
import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify("0.1.0-test") },
  optimizeDeps: { include: ["zustand", "dexie"] },
  test: {
    coverage: {
      provider: "istanbul",
      reporter: ["json", "text"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.*",
        "src/main.tsx",
        "src/simulation/worker.ts",
        "src/generation/generated/**",
        "src/generation/sineTable.ts",
        "src/generation/sineTableDigest.ts",
      ],
    },
    projects: [
      defineProject({
        test: {
          name: "unit",
          environment: "node",
          testTimeout: 30_000,
          include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
          setupFiles: ["./tests/unit/setup.ts"],
        },
      }),
      defineProject({
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/browser/setup.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }],
          },
        },
      }),
    ],
  },
});
