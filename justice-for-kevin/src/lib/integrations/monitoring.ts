/**
 * Error-monitoring boundary. The full @sentry/nextjs SDK is intentionally
 * not wired by default — enable it by setting SENTRY_DSN and following
 * SETUP.md → "Enabling Sentry". This module is the single funnel so PII
 * scrubbing happens in one place regardless of the backend.
 */

const SCRUB_KEYS = [
  "email",
  "phone",
  "fullName",
  "submitterName",
  "submitterPhone",
  "submitterEmail",
  "narrative",
  "originalNarrative",
  "password",
  "token",
];

export function scrubPii(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubPii);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = SCRUB_KEYS.some((needle) => key.toLowerCase().includes(needle.toLowerCase()))
        ? "[scrubbed]"
        : scrubPii(entry);
    }
    return out;
  }
  return value;
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  const safeContext = context ? scrubPii(context) : undefined;
  if (process.env.SENTRY_DSN) {
    // Integration point: replace with Sentry.captureException(error, { extra: safeContext })
    // once @sentry/nextjs is installed and configured (see SETUP.md).
    console.error("[monitoring:sentry-dsn-set]", error, safeContext ?? "");
    return;
  }
  console.error("[monitoring]", error, safeContext ?? "");
}
