import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../e2e/release",
  workers: 1,
  timeout: 210_000,
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [{ name: "soak-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    env: { VITE_TEST_HOOKS: "true" },
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  },
});
