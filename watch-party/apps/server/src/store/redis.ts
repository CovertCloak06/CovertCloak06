import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { LockTimeoutError, type Aggregate, type Store } from './types.js';

/** Deletes the lock only if we still own it (compare-and-delete). */
const RELEASE_LOCK = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export class RedisStore implements Store {
  readonly kind = 'redis' as const;

  constructor(readonly client: Redis) {}

  static connect(url: string): RedisStore {
    return new RedisStore(
      new Redis(url, {
        maxRetriesPerRequest: 3,
        enableAutoPipelining: true,
        lazyConnect: false,
      }),
    );
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async mgetJSON<T>(keys: string[]): Promise<Array<T | null>> {
    if (keys.length === 0) return [];
    const out: Array<T | null> = [];
    // Chunk to keep individual commands reasonable for big catalogs.
    for (let i = 0; i < keys.length; i += 500) {
      const raws = await this.client.mget(...keys.slice(i, i + 500));
      for (const raw of raws) out.push(raw === null ? null : (JSON.parse(raw) as T));
    }
    return out;
  }

  async setJSON(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlMs) await this.client.set(key, raw, 'PX', Math.ceil(ttlMs));
    else await this.client.set(key, raw);
  }

  async setJSONIfAbsent(key: string, value: unknown, ttlMs?: number): Promise<boolean> {
    const raw = JSON.stringify(value);
    const res = ttlMs
      ? await this.client.set(key, raw, 'PX', Math.ceil(ttlMs), 'NX')
      : await this.client.set(key, raw, 'NX');
    return res === 'OK';
  }

  async msetJSON(entries: Array<[string, unknown]>, ttlMs: number): Promise<void> {
    for (let i = 0; i < entries.length; i += 500) {
      const pipe = this.client.pipeline();
      for (const [k, v] of entries.slice(i, i + 500))
        pipe.set(k, JSON.stringify(v), 'PX', Math.ceil(ttlMs));
      await pipe.exec();
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async expire(key: string, ttlMs: number): Promise<void> {
    await this.client.pexpire(key, Math.ceil(ttlMs));
  }

  async replaceSortedSet(
    key: string,
    members: Array<[number, string]>,
    ttlMs: number,
    companionHash?: { key: string; fields: Record<string, string> },
  ): Promise<void> {
    // Build under temporary keys, then RENAME inside MULTI: readers never see
    // a half-written catalog.
    const suffix = randomUUID();
    const tmpZ = `${key}:tmp:${suffix}`;
    const tmpH = companionHash ? `${companionHash.key}:tmp:${suffix}` : null;
    const ttl = Math.ceil(ttlMs);
    const tx = this.client.multi();
    tx.del(key);
    for (let i = 0; i < members.length; i += 1_000) {
      tx.zadd(tmpZ, ...members.slice(i, i + 1_000).flatMap(([s, m]) => [s, m]));
    }
    if (members.length > 0) {
      tx.rename(tmpZ, key);
      tx.pexpire(key, ttl);
    }
    if (companionHash && tmpH) {
      tx.del(companionHash.key);
      const fields = Object.entries(companionHash.fields);
      if (fields.length > 0) {
        tx.hset(tmpH, Object.fromEntries(fields));
        tx.rename(tmpH, companionHash.key);
        tx.pexpire(companionHash.key, ttl);
      }
    }
    await tx.exec();
  }

  async zunionStore(
    dest: string,
    keys: string[],
    aggregate: Aggregate,
    ttlMs: number,
  ): Promise<number> {
    const [[, count]] = (await this.client
      .multi()
      .zunionstore(dest, keys.length, ...keys, 'AGGREGATE', aggregate)
      .pexpire(dest, Math.ceil(ttlMs))
      .exec()) as [[Error | null, number]];
    return count;
  }

  async zinterStore(
    dest: string,
    keys: string[],
    aggregate: Aggregate,
    ttlMs: number,
  ): Promise<number> {
    const [[, count]] = (await this.client
      .multi()
      .zinterstore(dest, keys.length, ...keys, 'AGGREGATE', aggregate)
      .pexpire(dest, Math.ceil(ttlMs))
      .exec()) as [[Error | null, number]];
    return count;
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrevrange(key, start, stop);
  }

  async zscore(key: string, member: string): Promise<number | null> {
    const s = await this.client.zscore(key, member);
    return s === null ? null : Number(s);
  }

  async zmscore(key: string, members: string[]): Promise<Array<number | null>> {
    if (members.length === 0) return [];
    const scores = await this.client.zmscore(key, ...members);
    return scores.map((s) => (s === null ? null : Number(s)));
  }

  async zcard(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  async hmget(key: string, fields: string[]): Promise<Array<string | null>> {
    if (fields.length === 0) return [];
    return this.client.hmget(key, ...fields);
  }

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const deadline = Date.now() + Math.max(ttlMs * 2, 2_000);
    let wait = 5;
    while ((await this.client.set(key, token, 'PX', Math.ceil(ttlMs), 'NX')) !== 'OK') {
      if (Date.now() > deadline) throw new LockTimeoutError(`Timed out waiting for lock ${key}`);
      await new Promise((r) => setTimeout(r, wait + Math.random() * wait));
      wait = Math.min(wait * 2, 100);
    }
    try {
      return await fn();
    } finally {
      await this.client.eval(RELEASE_LOCK, 1, key, token).catch(() => undefined);
    }
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
