import { describe, expect, it } from 'vitest';
import {
  intersectCatalogs,
  normalizeSubscription,
  subscriptionsCacheKey,
  InvalidSubscriptionError,
  type CatalogEntry,
} from '../src/catalog.js';
import { countryFlag, normalizeCountryCode } from '../src/countries.js';
import { nativeDeepLink, getService, serviceForUrl, servicesForCountry } from '../src/services.js';

const entry = (
  tmdbId: number,
  title: string,
  popularity: number,
  link: string | null = null,
): CatalogEntry => ({
  tmdbId,
  title,
  popularity,
  releaseYear: 2000,
  posterUrl: null,
  genres: [],
  link,
});

describe('countries', () => {
  it('normalises UK to GB and rejects unknown codes', () => {
    expect(normalizeCountryCode('uk')).toBe('GB');
    expect(normalizeCountryCode(' us ')).toBe('US');
    expect(normalizeCountryCode('ZZ')).toBeNull();
  });
  it('builds flag emoji', () => {
    expect(countryFlag('GB')).toBe('🇬🇧');
    expect(countryFlag('nope')).toBe('');
  });
});

describe('services', () => {
  it('matches service domains and subdomains only over https', () => {
    expect(serviceForUrl('https://www.netflix.com/watch/123')?.id).toBe('netflix');
    expect(serviceForUrl('https://assets.nflxext.netflix.com/x')?.id).toBe('netflix');
    expect(serviceForUrl('https://evilnetflix.com/')).toBeUndefined();
    expect(serviceForUrl('http://www.netflix.com/')).toBeUndefined();
    expect(serviceForUrl('not a url')).toBeUndefined();
  });
  it('filters regional services', () => {
    const gb = servicesForCountry('GB').map((s) => s.id);
    expect(gb).toContain('now');
    expect(gb).not.toContain('hulu');
    expect(servicesForCountry('US').map((s) => s.id)).toContain('hulu');
  });
  it('builds a Netflix app deep link from a title URL', () => {
    const netflix = getService('netflix')!;
    expect(nativeDeepLink(netflix, 'https://www.netflix.com/title/80100172/')).toBe(
      'nflx://www.netflix.com/title/80100172',
    );
    expect(nativeDeepLink(netflix, 'https://www.netflix.com/search?q=x')).toBe(
      'https://www.netflix.com/search?q=x',
    );
  });
});

describe('normalizeSubscription', () => {
  it('canonicalises country and de-duplicates services', () => {
    expect(
      normalizeSubscription({
        userId: 'a',
        countryCode: 'UK',
        services: ['prime', 'netflix', 'prime'],
      }),
    ).toEqual({ userId: 'a', countryCode: 'GB', services: ['netflix', 'prime'] });
  });
  it('rejects unknown services, countries and empty service lists', () => {
    expect(() =>
      normalizeSubscription({ userId: 'a', countryCode: 'US', services: ['vhs'] }),
    ).toThrow(InvalidSubscriptionError);
    expect(() =>
      normalizeSubscription({ userId: 'a', countryCode: 'XX', services: ['netflix'] }),
    ).toThrow(InvalidSubscriptionError);
    expect(() => normalizeSubscription({ userId: 'a', countryCode: 'US', services: [] })).toThrow(
      InvalidSubscriptionError,
    );
  });
});

describe('intersectCatalogs', () => {
  it('keeps titles every user can stream on at least one of their own services', () => {
    const result = intersectCatalogs([
      {
        userId: 'us',
        countryCode: 'US',
        catalogs: [
          {
            serviceId: 'netflix',
            entries: [
              entry(1, 'Alpha', 10, 'https://www.netflix.com/title/1'),
              entry(2, 'Beta', 50),
            ],
          },
          { serviceId: 'hulu', entries: [entry(3, 'Gamma', 30)] },
        ],
      },
      {
        userId: 'gb',
        countryCode: 'GB',
        catalogs: [
          { serviceId: 'prime', entries: [entry(1, 'Alpha', 20), entry(3, 'Gamma', 5)] },
          { serviceId: 'now', entries: [entry(4, 'Delta', 99)] },
        ],
      },
    ]);
    expect(result.map((r) => r.entry.tmdbId)).toEqual([3, 1]);
    const alpha = result.find((r) => r.entry.tmdbId === 1)!;
    expect(alpha.entry.popularity).toBe(20);
    expect(alpha.watchOptions.us).toEqual([
      expect.objectContaining({
        serviceId: 'netflix',
        countryCode: 'US',
        directLink: true,
        nativeUrl: 'nflx://www.netflix.com/title/1',
      }),
    ]);
    expect(alpha.watchOptions.gb).toEqual([
      expect.objectContaining({ serviceId: 'prime', countryCode: 'GB', directLink: false }),
    ]);
  });

  it('collects multiple options when a user has a title on several services', () => {
    const [only] = intersectCatalogs([
      {
        userId: 'a',
        countryCode: 'US',
        catalogs: [
          { serviceId: 'netflix', entries: [entry(7, 'Same', 1)] },
          { serviceId: 'max', entries: [entry(7, 'Same', 2)] },
        ],
      },
    ]);
    expect(only!.watchOptions.a!.map((o) => o.serviceId)).toEqual(['netflix', 'max']);
  });

  it('returns nothing when any user has no overlap', () => {
    expect(
      intersectCatalogs([
        {
          userId: 'a',
          countryCode: 'US',
          catalogs: [{ serviceId: 'netflix', entries: [entry(1, 'A', 1)] }],
        },
        {
          userId: 'b',
          countryCode: 'GB',
          catalogs: [{ serviceId: 'netflix', entries: [entry(2, 'B', 1)] }],
        },
      ]),
    ).toEqual([]);
    expect(intersectCatalogs([])).toEqual([]);
  });
});

describe('subscriptionsCacheKey', () => {
  it('ignores user ids and ordering', () => {
    const a = subscriptionsCacheKey([
      { userId: '1', countryCode: 'US', services: ['prime', 'netflix'] },
      { userId: '2', countryCode: 'GB', services: ['netflix'] },
    ]);
    const b = subscriptionsCacheKey([
      { userId: 'x', countryCode: 'GB', services: ['netflix'] },
      { userId: 'y', countryCode: 'US', services: ['netflix', 'prime'] },
    ]);
    expect(a).toBe(b);
  });
});
