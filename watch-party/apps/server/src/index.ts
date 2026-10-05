import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createLogger } from './logger.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[watch-party] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  const logger = createLogger(config.logLevel);
  for (const w of config.warnings) logger.warn(w);

  const app = createApp(config, logger);
  const port = await app.listen();
  logger.info(
    {
      port,
      provider: config.catalog.provider,
      store: app.store.kind,
      devHarness: config.devHarness,
    },
    'watch party server listening',
  );
  if (config.devHarness) logger.info(`dev harness: http://localhost:${port}/dev/`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 10_000).unref();
    try {
      await app.close();
    } finally {
      clearTimeout(force);
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
