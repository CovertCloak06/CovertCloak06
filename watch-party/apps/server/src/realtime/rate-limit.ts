/** Token-bucket rate limiter keyed by an arbitrary string (socket id + bucket). */
export interface BucketSpec {
  /** Tokens added per second. */
  ratePerSec: number;
  /** Maximum tokens (burst size). */
  burst: number;
}

export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  take(key: string, spec: BucketSpec, cost = 1): boolean {
    const now = this.now();
    const b = this.buckets.get(key) ?? { tokens: spec.burst, updated: now };
    b.tokens = Math.min(spec.burst, b.tokens + ((now - b.updated) / 1000) * spec.ratePerSec);
    b.updated = now;
    const ok = b.tokens >= cost;
    if (ok) b.tokens -= cost;
    this.buckets.set(key, b);
    return ok;
  }

  /** Forget every bucket with this prefix (e.g. when a socket disconnects). */
  clear(prefix: string): void {
    for (const k of this.buckets.keys()) if (k.startsWith(prefix)) this.buckets.delete(k);
  }
}

export const BUCKETS = {
  sync: { ratePerSec: 8, burst: 16 },
  heartbeat: { ratePerSec: 2, burst: 4 },
  status: { ratePerSec: 4, burst: 8 },
  ping: { ratePerSec: 10, burst: 20 },
  control: { ratePerSec: 2, burst: 6 },
} satisfies Record<string, BucketSpec>;
