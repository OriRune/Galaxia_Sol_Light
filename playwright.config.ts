import { defineConfig, devices } from "@playwright/test";

const suppliedBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const localPort = 5187;
const localBaseUrl = `http://127.0.0.1:${String(localPort)}`;
let hostedBaseUrl: string | undefined;
if (suppliedBaseUrl !== undefined) {
  const parsed = new URL(suppliedBaseUrl);
  if (parsed.protocol !== "https:") throw new Error("PLAYWRIGHT_BASE_URL must be an HTTPS URL.");
  hostedBaseUrl = parsed.href;
}
const isWindows = process.platform === "win32";
const localProjects = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /hosted|release/ },
  { name: "firefox", use: { ...devices["Desktop Firefox"] }, testIgnore: /hosted|release/ },
  ...(isWindows
    ? [
        {
          name: "edge",
          use: { ...devices["Desktop Edge"], channel: "msedge" },
          testIgnore: /hosted|release/,
        },
      ]
    : []),
];
const hostedProjects = [
  { name: "hosted-chromium", use: { ...devices["Desktop Chrome"] }, testMatch: /hosted/ },
  { name: "hosted-firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /hosted/ },
];

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: hostedBaseUrl ?? localBaseUrl, trace: "retain-on-failure" },
  projects: hostedBaseUrl === undefined ? localProjects : hostedProjects,
  ...(hostedBaseUrl === undefined
    ? {
        webServer: {
          command: `npm run dev -- --port ${String(localPort)}`,
          env: { VITE_TEST_HOOKS: "true" },
          url: localBaseUrl,
          reuseExistingServer: false,
        },
      }
    : {}),
});
