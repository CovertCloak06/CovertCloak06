import { intersectCatalogs, type UserSubscription } from '@watch-party/shared';
import { describe, expect, it } from 'vitest';
import { CatalogService, CatalogUnavailableError } from '../src/catalog/catalog-service.js';
import { FixtureCatalogProvider, fixtureAvailable } from '../src/catalog/providers/fixture.js';
import { MemoryStore } from '../src/store/memory.js';
import { RedisStore } from '../src/store/redis.js';
import type { Store } from '../src/store/types.js';
import { silentLogger, StubProvider, title } from './helpers.js';

const users: UserSubscription[] = [
  { userId: 'ana', countryCode: 'US', services: ['netflix', 'hulu'] },
  { userId: 'ben', countryCode: 'GB', services: ['prime'] },
];

function makeStub() {
  return new StubProvider({
    'US:netflix': [title(1, 'Alpha', 50, 'https://www.netflix.com/title/111'), title(2, 'Beta', 40), title(5, 'Epsilon', 10)],
    'US:hulu': [title(3, 'Gamma', 30)],
    'GB:prime': [title(1, 'Alpha', 20), title(3, 'Gamma', 35), title(4, 'Delta', 99)],
  });
}

function makeService(store: Store, provider = makeStub(), now = () => Date.now()) {
  return { provider, svc: new CatalogService({ store, provider, ttlMs: 3_600_000, logger: silentLogger, now, random: () => 0.5 }) };
}

describe('CatalogService', () => {
  it('intersects regional subscription catalogs across users', async () => {
    const { svc } = makeService(new MemoryStore());
    const res = await svc.getCommonTitles(users);
    expect(res.results.map((r) => r.title)).toEqual(['Alpha', 'Gamma']);
    expect(res.totalResults).toBe(2);
    expect(res.provider).toBe('stub');
    expect(res.partial).toBe(false);
    const alpha = res.results[0]!;
    expect(alpha.popularity).toBe(50);
    expect(alpha.watchOptions.ana).toEqual([
      expect.objectContaining({ serviceId: 'netflix', directLink: true, nativeUrl: 'nflx://www.netflix.com/title/111' }),
    ]);
    expect(alpha.watchOptions.ben).toEqual([expect.objectContaining({ serviceId: 'prime', countryCode: 'GB' })]);
  });

  it('caches catalogs: each (country, service) is fetched once', async () => {
    const { svc, provider } = makeService(new MemoryStore());
    await Promise.all([svc.getCommonTitles(users), svc.getCommonTitles(users), svc.getCommonTitles([users[0]!])]);
    expect(provider.calls.sort()).toEqual(['GB:prime', 'US:hulu', 'US:netflix']);
  });

  it('refreshes after the TTL and serves stale data when the refresh fails', async () => {
    let now = 1_000_000;
    const store = new MemoryStore(() => now);
    const { svc, provider } = makeService(store, makeStub(), () => now);
    await svc.getCommonTitles(users);
    now += 1.5 * 3_600_000; // past the 1h TTL, inside the 2h stale window
    provider.fail = true;
    const res = await svc.getCommonTitles([{ userId: 'z', countryCode: 'US', services: ['hulu'] }]);
    expect(res.results.map((r) => r.title)).toEqual(['Gamma']);
    expect(provider.calls.filter((c) => c === 'US:hulu')).toHaveLength(2);
  });

  it('fails cleanly when a catalog was never fetched and the provider is down', async () => {
    const { svc, provider } = makeService(new MemoryStore());
    provider.fail = true;
    await expect(svc.getCommonTitles(users)).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it('paginates, filters by genre and searches titles accent-insensitively', async () => {
    const provider = new StubProvider({
      'US:netflix': [
        { ...title(10, 'Amélie', 5), genres: ['Comedy', 'Romance'] },
        { ...title(11, 'Alien', 9), genres: ['Horror'] },
        { ...title(12, 'Arrival', 7), genres: ['Science Fiction'] },
      ],
    });
    const { svc } = makeService(new MemoryStore(), provider);
    const u = [{ userId: 'a', countryCode: 'US', services: ['netflix'] }];
    const page2 = await svc.getCommonTitles(u, { page: 2, pageSize: 2 });
    expect(page2.results.map((r) => r.title)).toEqual(['Amélie']);
    expect(page2.totalResults).toBe(3);
    expect((await svc.getCommonTitles(u, { genre: 'horror' })).results.map((r) => r.title)).toEqual(['Alien']);
    expect((await svc.getCommonTitles(u, { query: 'amelie' })).results.map((r) => r.title)).toEqual(['Amélie']);
  });

  it('flags partial results when a catalog was truncated by the page budget', async () => {
    const provider = new StubProvider({ 'US:netflix': { entries: [title(1, 'A', 1)], truncated: true } });
    const { svc } = makeService(new MemoryStore(), provider);
    const res = await svc.getCommonTitles([{ userId: 'a', countryCode: 'US', services: ['netflix'] }]);
    expect(res.partial).toBe(true);
  });

  it('returns per-user watch options for a single title, including users without access', async () => {
    const { svc } = makeService(new MemoryStore());
    const options = await svc.watchOptionsFor(2, users);
    expect(options.ana!.map((o) => o.serviceId)).toEqual(['netflix']);
    expect(options.ben).toEqual([]);
  });

  it('enriches missing runtime/overview from the metadata provider and caches it', async () => {
    let calls = 0;
    const store = new MemoryStore();
    const svc = new CatalogService({
      store,
      provider: makeStub(),
      ttlMs: 3_600_000,
      logger: silentLogger,
      metadata: {
        async getMovie(id) {
          calls++;
          return { tmdbId: id, title: 'x', overview: 'Plot', releaseYear: 2001, runtimeMinutes: 99, posterUrl: 'p', backdropUrl: 'b', genres: [] };
        },
      },
    });
    const first = await svc.getCommonTitles(users);
    expect(first.results[0]).toMatchObject({ title: 'Alpha', runtimeMinutes: 99, overview: 'Plot', posterUrl: 'p' });
    await svc.getCommonTitles(users);
    expect(calls).toBe(2); // two titles, enriched once each
  });

  it('matches the reference intersection on the fixture catalog (memory and redis)', async () => {
    const stores: Store[] = [new MemoryStore()];
    if (process.env.TEST_REDIS_URL) {
      const r = RedisStore.connect(process.env.TEST_REDIS_URL);
      await r.client.flushdb();
      stores.push(r);
    }
    const fixture = new FixtureCatalogProvider();
    const people: UserSubscription[] = [
      { userId: 'us', countryCode: 'US', services: ['netflix', 'max', 'hulu'] },
      { userId: 'gb', countryCode: 'GB', services: ['netflix', 'prime', 'now'] },
      { userId: 'de', countryCode: 'DE', services: ['disney', 'prime'] },
    ];
    const { getService } = await import('@watch-party/shared');
    const reference = intersectCatalogs(
      await Promise.all(
        people.map(async (p) => ({
          userId: p.userId,
          countryCode: p.countryCode,
          catalogs: await Promise.all(
            p.services.map(async (s) => ({ serviceId: s, entries: (await fixture.fetchCatalog(p.countryCode, getService(s)!)).entries })),
          ),
        })),
      ),
    );
    for (const store of stores) {
      const svc = new CatalogService({ store, provider: fixture, ttlMs: 3_600_000, logger: silentLogger });
      const res = await svc.getCommonTitles(people, { pageSize: 100 });
      expect(res.results.map((r) => r.tmdbId)).toEqual(reference.map((r) => r.entry.tmdbId));
      for (const r of res.results) {
        expect(Object.keys(r.watchOptions).sort()).toEqual(['de', 'gb', 'us']);
      }
      await store.close();
    }
    expect(reference.length).toBeGreaterThan(0);
    expect(fixtureAvailable(550, 'US', 'netflix')).toBe(fixtureAvailable(550, 'US', 'netflix'));
  });
});
