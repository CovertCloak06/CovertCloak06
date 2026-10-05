import pino, { type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: 'watch-party-server' },
    // Never log credentials if a request object is ever passed to the logger.
    redact: ['req.headers.authorization', 'headers.authorization', 'token', '*.token'],
  });
}
