import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_EXT_PORT ?? 8788);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    // The server package's harness build and sample media provide the pages under /dev.
    command: 'npm run build:harness -w @watch-party/server && npm run media -w @watch-party/server && npx tsx ../server/src/index.ts',
    cwd: '.',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DEV_HARNESS: '1',
      LOG_LEVEL: 'warn',
      SESSION_SECRET: 'ext-e2e-secret-ext-e2e-secret-ext-e2e',
    },
  },
});
