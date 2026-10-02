import "server-only";

/**
 * Fixed-window in-memory rate limiter. Suitable for a single-region
 * deployment; swap for a durable store (Upstash/Redis or a Postgres
 * counter) when scaling horizontally — the call-site contract stays
 * identical. See SECURITY.md → "Rate limiting".
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const current = windows.get(key);

  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Periodic cleanup to keep the map bounded. */
export function pruneRateLimitWindows(): void {
  const now = Date.now();
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}
