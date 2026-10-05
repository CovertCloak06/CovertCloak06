import { randomUUID } from 'node:crypto';
import { LockTimeoutError, type Aggregate, type Store } from './types.js';

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

/**
 * In-process {@link Store}. Mirrors Redis semantics closely enough for the
 * catalog and room logic, including TTLs and lock leases.
 */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private data = new Map<string, Entry>();
  private locks = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private read(key: string): unknown {
    const e = this.data.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== null && e.expiresAt <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e.value;
  }

  private write(key: string, value: unknown, ttlMs?: number): void {
    this.data.set(key, { value, expiresAt: ttlMs ? this.now() + ttlMs : null });
  }

  private zset(key: string): Map<string, number> {
    const v = this.read(key);
    return v instanceof Map ? (v as Map<string, number>) : new Map();
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const v = this.read(key);
    return typeof v === 'string' ? (JSON.parse(v) as T) : null;
  }

  async mgetJSON<T>(keys: string[]): Promise<Array<T | null>> {
    return Promise.all(keys.map((k) => this.getJSON<T>(k)));
  }

  async setJSON(key: string, value: unknown, ttlMs?: number): Promise<void> {
    this.write(key, JSON.stringify(value), ttlMs);
  }

  async setJSONIfAbsent(key: string, value: unknown, ttlMs?: number): Promise<boolean> {
    if (this.read(key) !== undefined) return false;
    this.write(key, JSON.stringify(value), ttlMs);
    return true;
  }

  async msetJSON(entries: Array<[string, unknown]>, ttlMs: number): Promise<void> {
    for (const [k, v] of entries) this.write(k, JSON.stringify(v), ttlMs);
  }

  async del(...keys: string[]): Promise<void> {
    for (const k of keys) this.data.delete(k);
  }

  async exists(key: string): Promise<boolean> {
    return this.read(key) !== undefined;
  }

  async expire(key: string, ttlMs: number): Promise<void> {
    const e = this.data.get(key);
    if (e && this.read(key) !== undefined) e.expiresAt = this.now() + ttlMs;
  }

  async replaceSortedSet(
    key: string,
    members: Array<[number, string]>,
    ttlMs: number,
    companionHash?: { key: string; fields: Record<string, string> },
  ): Promise<void> {
    const map = new Map<string, number>();
    for (const [score, member] of members) map.set(member, score);
    this.write(key, map, ttlMs);
    if (companionHash) {
      this.write(companionHash.key, new Map(Object.entries(companionHash.fields)), ttlMs);
    }
  }

  async zunionStore(
    dest: string,
    keys: string[],
    aggregate: Aggregate,
    ttlMs: number,
  ): Promise<number> {
    const out = new Map<string, number>();
    for (const k of keys) {
      for (const [m, s] of this.zset(k)) {
        const prev = out.get(m);
        out.set(m, prev === undefined ? s : combine(prev, s, aggregate));
      }
    }
    this.write(dest, out, ttlMs);
    return out.size;
  }

  async zinterStore(
    dest: string,
    keys: string[],
    aggregate: Aggregate,
    ttlMs: number,
  ): Promise<number> {
    const sets = keys.map((k) => this.zset(k));
    const out = new Map<string, number>();
    const [first, ...rest] = sets;
    if (first) {
      for (const [m, s] of first) {
        let score = s;
        let all = true;
        for (const other of rest) {
          const os = other.get(m);
          if (os === undefined) {
            all = false;
            break;
          }
          score = combine(score, os, aggregate);
        }
        if (all) out.set(m, score);
      }
    }
    this.write(dest, out, ttlMs);
    return out.size;
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    const sorted = [...this.zset(key)].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0),
    );
    const end = stop < 0 ? sorted.length + stop + 1 : stop + 1;
    return sorted.slice(start, end).map(([m]) => m);
  }

  async zscore(key: string, member: string): Promise<number | null> {
    return this.zset(key).get(member) ?? null;
  }

  async zmscore(key: string, members: string[]): Promise<Array<number | null>> {
    const set = this.zset(key);
    return members.map((m) => set.get(m) ?? null);
  }

  async zcard(key: string): Promise<number> {
    return this.zset(key).size;
  }

  async hmget(key: string, fields: string[]): Promise<Array<string | null>> {
    const v = this.read(key);
    const map = v instanceof Map ? (v as Map<string, string>) : new Map<string, string>();
    return fields.map((f) => map.get(f) ?? null);
  }

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const deadline = Date.now() + Math.max(ttlMs * 2, 2_000);
    for (;;) {
      const held = this.locks.get(key);
      if (!held || held.expiresAt <= this.now()) {
        this.locks.set(key, { token, expiresAt: this.now() + ttlMs });
        break;
      }
      if (Date.now() > deadline) throw new LockTimeoutError(`Timed out waiting for lock ${key}`);
      await new Promise((r) => setTimeout(r, 5));
    }
    try {
      return await fn();
    } finally {
      if (this.locks.get(key)?.token === token) this.locks.delete(key);
    }
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.data.clear();
    this.locks.clear();
  }
}

function combine(a: number, b: number, aggregate: Aggregate): number {
  return aggregate === 'MIN' ? Math.min(a, b) : aggregate === 'MAX' ? Math.max(a, b) : a + b;
}
