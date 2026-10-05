import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.js';
import { RedisStore } from '../src/store/redis.js';
import type { Store } from '../src/store/types.js';

const REDIS_URL = process.env.TEST_REDIS_URL;

/** Contract test run against every Store implementation. */
function storeContract(name: string, make: () => Store, cleanup: (s: Store) => Promise<void>) {
  describe(name, () => {
    let store: Store;
    const k = (s: string) => `test:${name}:${s}`;
    beforeAll(() => {
      store = make();
    });
    afterAll(async () => {
      await cleanup(store);
      await store.close();
    });

    it('stores JSON with TTL and set-if-absent', async () => {
      await store.setJSON(k('a'), { x: 1 }, 10_000);
      expect(await store.getJSON(k('a'))).toEqual({ x: 1 });
      expect(await store.setJSONIfAbsent(k('a'), { x: 2 })).toBe(false);
      expect(await store.setJSONIfAbsent(k('b'), { x: 3 }, 10_000)).toBe(true);
      expect(await store.mgetJSON([k('a'), k('missing'), k('b')])).toEqual([{ x: 1 }, null, { x: 3 }]);
      await store.setJSON(k('short'), 1, 30);
      await new Promise((r) => setTimeout(r, 80));
      expect(await store.getJSON(k('short'))).toBeNull();
    });

    it('replaces sorted sets atomically with companion hashes', async () => {
      await store.replaceSortedSet(k('z1'), [[5, '1'], [9, '2'], [1, '3']], 10_000, { key: k('h1'), fields: { '2': 'link2' } });
      expect(await store.zrevrange(k('z1'), 0, -1)).toEqual(['2', '1', '3']);
      expect(await store.zmscore(k('z1'), ['1', 'nope'])).toEqual([5, null]);
      expect(await store.hmget(k('h1'), ['1', '2'])).toEqual([null, 'link2']);
      await store.replaceSortedSet(k('z1'), [[1, '7']], 10_000, { key: k('h1'), fields: {} });
      expect(await store.zrevrange(k('z1'), 0, -1)).toEqual(['7']);
      expect(await store.hmget(k('h1'), ['2'])).toEqual([null]);
    });

    it('unions and intersects with aggregation like Redis', async () => {
      await store.replaceSortedSet(k('a1'), [[1, 'x'], [5, 'y']], 10_000);
      await store.replaceSortedSet(k('a2'), [[3, 'x'], [2, 'z']], 10_000);
      await store.replaceSortedSet(k('b1'), [[10, 'x'], [1, 'z']], 10_000);
      expect(await store.zunionStore(k('u'), [k('a1'), k('a2')], 'MAX', 10_000)).toBe(3);
      expect(await store.zscore(k('u'), 'x')).toBe(3);
      expect(await store.zinterStore(k('i'), [k('u'), k('b1')], 'MAX', 10_000)).toBe(2);
      expect(await store.zrevrange(k('i'), 0, -1)).toEqual(['x', 'z']);
      expect(await store.zcard(k('i'))).toBe(2);
      expect(await store.zinterStore(k('none'), [k('u'), k('missing')], 'MAX', 10_000)).toBe(0);
    });

    it('serialises critical sections with withLock', async () => {
      let inside = 0;
      let maxInside = 0;
      await Promise.all(
        Array.from({ length: 10 }, () =>
          store.withLock(k('lock'), 2_000, async () => {
            inside++;
            maxInside = Math.max(maxInside, inside);
            await new Promise((r) => setTimeout(r, 5));
            inside--;
          }),
        ),
      );
      expect(maxInside).toBe(1);
    });
  });
}

storeContract('memory', () => new MemoryStore(), async () => undefined);

if (REDIS_URL) {
  storeContract(
    'redis',
    () => RedisStore.connect(REDIS_URL),
    async (s) => {
      const r = (s as RedisStore).client;
      const keys = await r.keys('test:redis:*');
      if (keys.length) await r.del(...keys);
    },
  );
} else {
  describe.skip('redis (set TEST_REDIS_URL to run)', () => {
    it('skipped', () => undefined);
  });
}
