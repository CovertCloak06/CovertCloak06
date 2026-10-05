import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8787);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    },
  },
  webServer: {
    command: 'npx tsx src/index.ts',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DEV_HARNESS: '1',
      LOG_LEVEL: 'warn',
      MEMBER_GRACE_MS: '2000',
      SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
      ...(process.env.E2E_REDIS_URL ? { REDIS_URL: process.env.E2E_REDIS_URL } : {}),
    },
  },
});
