import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://localhost:3000",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  projects: [{ name: "edge", use: { ...devices["Desktop Edge"] } }],
  webServer: {
    command: "npm run dev:web -- --hostname 127.0.0.1 --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
