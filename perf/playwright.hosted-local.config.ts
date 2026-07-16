import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../e2e",
  testMatch: /hosted/,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4181", trace: "retain-on-failure" },
  projects: [
    { name: "hosted-local-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "hosted-local-firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: "npm run preview -- --port 4181",
    url: "http://127.0.0.1:4181",
    reuseExistingServer: false,
  },
});
