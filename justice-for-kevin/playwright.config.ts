import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Some CI/sandbox environments pre-install a Chromium binary; use it instead
// of downloading a matching Playwright revision when present.
const preinstalledChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const launchOptions = existsSync(preinstalledChromium)
  ? { executablePath: preinstalledChromium }
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
