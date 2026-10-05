import { getService } from '@watch-party/shared';
import { describe, expect, it } from 'vitest';
import {
  parseSaTmdbId,
  StreamingAvailabilityProvider,
  type SaSearchResponse,
  type SaShow,
  type SaStreamingOption,
} from '../src/catalog/providers/streaming-availability.js';
import { normalizeProviderName, TmdbClient, type DiscoverResponse } from '../src/catalog/providers/tmdb.js';
import { fetchJson, UpstreamError } from '../src/http/fetch-json.js';

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
function mockFetch(handler: Handler) {
  const calls: Array<{ url: URL; headers: Record<string, string> }> = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
    return handler(url, init);
  }) as typeof fetch;
  return { impl, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('fetchJson', () => {
  it('retries 429 and 5xx, then succeeds', async () => {
    let n = 0;
    const { impl } = mockFetch(() => (++n < 3 ? json({}, n === 1 ? 429 : 503, { 'retry-after': '0' }) : json({ ok: 1 })));
    await expect(fetchJson('https://x.test/a', { label: 'x', fetchImpl: impl })).resolves.toEqual({ ok: 1 });
    expect(n).toBe(3);
  });
  it('does not retry client errors and never leaks the URL', async () => {
    const { impl, calls } = mockFetch(() => json({ secret: 1 }, 401));
    const err = (await fetchJson('https://x.test/a?api_key=SECRET', { label: 'Thing', fetchImpl: impl }).catch(
      (e: unknown) => e,
    )) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    expect(String(err.message)).toBe('Thing: HTTP 401');
    expect(calls).toHaveLength(1);
  });
});

describe('StreamingAvailabilityProvider', () => {
  const page = (shows: SaSearchResponse['shows'], nextCursor?: string): SaSearchResponse => ({
    shows,
    hasMore: !!nextCursor,
    ...(nextCursor ? { nextCursor } : {}),
  });
  const show = (
    tmdb: string,
    title: string,
    options: Array<{ service: string; type: SaStreamingOption['type']; link?: string; videoLink?: string }>,
  ): SaShow => ({
    id: title,
    tmdbId: tmdb,
    title,
    releaseYear: 2010,
    runtime: 100,
    overview: 'o',
    genres: [{ id: 'drama', name: 'Drama' }],
    imageSet: { verticalPoster: { w360: `https://img/${title}.jpg` } },
    streamingOptions: {
      gb: options.map((o) => ({
        service: { id: o.service },
        type: o.type,
        ...(o.link ? { link: o.link } : {}),
        ...(o.videoLink ? { videoLink: o.videoLink } : {}),
      })),
    },
  });

  it('pages through results, keeps only subscription options for the service, and ranks by order', async () => {
    const { impl, calls } = mockFetch((url) =>
      url.searchParams.get('cursor') === 'c2'
        ? json(page([show('movie/3', 'Three', [{ service: 'netflix', type: 'subscription', link: 'https://www.netflix.com/title/3' }])]))
        : json(
            page(
              [
                show('movie/1', 'One', [{ service: 'netflix', type: 'subscription', link: 'L1', videoLink: 'https://www.netflix.com/watch/1' }]),
                show('movie/2', 'Rent', [{ service: 'netflix', type: 'rent', link: 'L2' }]),
                show('tv/9', 'Series', [{ service: 'netflix', type: 'subscription' }]),
                show('movie/4', 'Other', [{ service: 'prime', type: 'subscription' }]),
              ],
              'c2',
            ),
          ),
    );
    const sa = new StreamingAvailabilityProvider({ apiKey: 'KEY', mode: 'rapidapi', maxPages: 5, fetchImpl: impl });
    const { entries, truncated } = await sa.fetchCatalog('GB', getService('netflix')!);
    expect(truncated).toBe(false);
    expect(entries.map((e) => [e.tmdbId, e.link])).toEqual([
      [1, 'https://www.netflix.com/watch/1'],
      [3, 'https://www.netflix.com/title/3'],
    ]);
    expect(entries[0]!.popularity).toBeGreaterThan(entries[1]!.popularity);
    expect(entries[0]).toMatchObject({ posterUrl: 'https://img/One.jpg', runtimeMinutes: 100, genres: ['Drama'] });
    expect(calls[0]!.url.host).toBe('streaming-availability.p.rapidapi.com');
    expect(calls[0]!.url.searchParams.get('catalogs')).toBe('netflix.subscription');
    expect(calls[0]!.url.searchParams.get('country')).toBe('gb');
    expect(calls[0]!.headers['X-RapidAPI-Key']).toBe('KEY');
  });

  it('stops at the page budget and reports truncation', async () => {
    const { impl, calls } = mockFetch(() => json(page([], 'more')));
    const sa = new StreamingAvailabilityProvider({ apiKey: 'K', mode: 'direct', maxPages: 2, fetchImpl: impl });
    const res = await sa.fetchCatalog('US', getService('max')!);
    expect(res.truncated).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url.host).toBe('api.movieofthenight.com');
    expect(calls[0]!.url.searchParams.get('catalogs')).toBe('hbo.subscription');
  });

  it('parses TMDB ids', () => {
    expect(parseSaTmdbId('movie/550')).toBe(550);
    expect(parseSaTmdbId('tv/1')).toBeNull();
    expect(parseSaTmdbId(undefined)).toBeNull();
  });
});

describe('TmdbClient', () => {
  const discover = (page: number, total: number, ids: number[]): DiscoverResponse => ({
    page,
    total_pages: total,
    total_results: total * ids.length,
    results: ids.map((id) => ({
      id,
      title: `T${id}`,
      release_date: '2001-05-01',
      popularity: 100 - id,
      poster_path: `/p${id}.jpg`,
      backdrop_path: null,
      genre_ids: [18],
    })),
  });

  it('resolves provider ids by name and requests flat-rate availability only', async () => {
    const { impl, calls } = mockFetch((url) => {
      if (url.pathname.endsWith('/watch/providers/movie')) {
        return json({ results: [{ provider_id: 1899, provider_name: 'Max' }, { provider_id: 9999, provider_name: 'Max Amazon Channel' }] });
      }
      if (url.pathname.endsWith('/genre/movie/list')) return json({ genres: [{ id: 18, name: 'Drama' }] });
      const p = Number(url.searchParams.get('page'));
      return json(discover(p, 3, p === 1 ? [1, 2] : p === 2 ? [2, 3] : [4]));
    });
    const tmdb = new TmdbClient({ readToken: 'TOKEN', maxPages: 2, fetchImpl: impl });
    const res = await tmdb.fetchCatalog('US', getService('max')!);
    expect(res.entries.map((e) => e.tmdbId)).toEqual([1, 2, 3]);
    expect(res.truncated).toBe(true);
    expect(res.entries[0]).toMatchObject({ releaseYear: 2001, genres: ['Drama'], posterUrl: 'https://image.tmdb.org/t/p/w342/p1.jpg', link: null });
    const d = calls.find((c) => c.url.pathname.endsWith('/discover/movie'))!;
    expect(d.url.searchParams.get('with_watch_providers')).toBe('1899');
    expect(d.url.searchParams.get('with_watch_monetization_types')).toBe('flatrate');
    expect(d.url.searchParams.get('watch_region')).toBe('US');
    expect(d.headers.authorization).toBe('Bearer TOKEN');
  });

  it('falls back to registry ids when the provider list is unavailable', async () => {
    const { impl, calls } = mockFetch((url) => {
      if (url.pathname.endsWith('/watch/providers/movie')) return json({}, 500);
      if (url.pathname.endsWith('/genre/movie/list')) return json({ genres: [] });
      return json(discover(1, 1, [7]));
    });
    const tmdb = new TmdbClient({ apiKey: 'K3', maxPages: 5, fetchImpl: impl });
    await tmdb.fetchCatalog('GB', getService('prime')!);
    const d = calls.find((c) => c.url.pathname.endsWith('/discover/movie'))!;
    expect(d.url.searchParams.get('with_watch_providers')).toBe('9|119');
    expect(d.url.searchParams.get('api_key')).toBe('K3');
  });

  it('normalises provider names', () => {
    expect(normalizeProviderName('Disney+')).toBe('disney plus');
    expect(normalizeProviderName('Apple TV Plus')).toBe('apple tv plus');
  });
});
