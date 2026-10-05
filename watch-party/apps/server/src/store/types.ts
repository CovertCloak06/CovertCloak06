/**
 * Storage abstraction over Redis, with an in-memory twin for local
 * development and tests. The catalog engine relies on sorted-set algebra
 * (ZUNIONSTORE / ZINTERSTORE) so whole catalogs never leave the store; the
 * in-memory store implements the same semantics.
 */
export type Aggregate = 'MIN' | 'MAX' | 'SUM';

export interface Store {
  readonly kind: 'redis' | 'memory';

  getJSON<T>(key: string): Promise<T | null>;
  mgetJSON<T>(keys: string[]): Promise<Array<T | null>>;
  setJSON(key: string, value: unknown, ttlMs?: number): Promise<void>;
  /** Sets only if absent. Returns true when the value was written. */
  setJSONIfAbsent(key: string, value: unknown, ttlMs?: number): Promise<boolean>;
  /** Writes many JSON values with one TTL, in one round trip where possible. */
  msetJSON(entries: Array<[key: string, value: unknown]>, ttlMs: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  exists(key: string): Promise<boolean>;
  expire(key: string, ttlMs: number): Promise<void>;

  /** Atomically replaces a sorted set (and an optional companion hash) with new content. */
  replaceSortedSet(
    key: string,
    members: Array<[score: number, member: string]>,
    ttlMs: number,
    companionHash?: { key: string; fields: Record<string, string> },
  ): Promise<void>;
  zunionStore(dest: string, keys: string[], aggregate: Aggregate, ttlMs: number): Promise<number>;
  zinterStore(dest: string, keys: string[], aggregate: Aggregate, ttlMs: number): Promise<number>;
  /** Members by descending score (ties by descending member), inclusive range. */
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  zscore(key: string, member: string): Promise<number | null>;
  /** Scores for many members at once (null where absent). */
  zmscore(key: string, members: string[]): Promise<Array<number | null>>;
  zcard(key: string): Promise<number>;
  hmget(key: string, fields: string[]): Promise<Array<string | null>>;

  /**
   * Runs `fn` while holding a lock. Locks are leased (`ttlMs`) so a crashed
   * holder can't wedge a room or catalog forever.
   */
  withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;

  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export class LockTimeoutError extends Error {
  override name = 'LockTimeoutError';
}
