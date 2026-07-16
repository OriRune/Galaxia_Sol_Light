import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const port = Number(process.env.BENCHMARK_PORT ?? 4174);

export default defineConfig({
  testDir: ".",
  testMatch: /renderer-(?:normative|informational)\.spec\.ts/,
  timeout: 300_000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${String(port)}`, viewport: { width: 1920, height: 1080 } },
  projects: [
    {
      name: "system-edge",
      use: {
        ...devices["Desktop Edge"],
        channel: "msedge",
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
  webServer: {
    command: `vite preview --host 127.0.0.1 --port ${String(port)}`,
    url: `http://127.0.0.1:${String(port)}`,
    reuseExistingServer: false,
    cwd: path.resolve(import.meta.dirname, ".."),
  },
});
