import { defineConfig, devices } from "@playwright/test";

// Smoke E2E local : la stack (docker-compose.dev + backend uv + next dev)
// est lancee a la main. Voir frontend/e2e/README.md.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
