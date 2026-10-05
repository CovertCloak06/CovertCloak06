/**
 * TMDB as both a catalog provider and a metadata source.
 *
 * Catalogs: `/discover/movie` with `watch_region`, `with_watch_providers`
 * (pipe = OR) and `with_watch_monetization_types=flatrate`. TMDB's watch
 * provider data comes from JustWatch, so the UI must credit JustWatch.
 *
 * Provider ids: the registry carries known ids, but TMDB re-keys providers
 * after rebrands. Ids are resolved per region from `/watch/providers/movie`
 * by name and cached, so a stale id can't silently produce an empty catalog.
 */
import type { ServiceDefinition, TitleMetadata } from '@watch-party/shared';
import { fetchJson, mapWithConcurrency } from '../../http/fetch-json.js';
import type { CatalogProvider, MetadataProvider, ProviderCatalog, ProviderTitle } from './types.js';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
/** TMDB refuses pages beyond 500. */
const TMDB_MAX_PAGE = 500;

interface DiscoverResult {
  id: number;
  title: string;
  overview?: string;
  release_date?: string;
  popularity: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
}
export interface DiscoverResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: DiscoverResult[];
}
interface ProvidersResponse {
  results: Array<{ provider_id: number; provider_name: string }>;
}
interface GenreResponse {
  genres: Array<{ id: number; name: string }>;
}
interface MovieResponse {
  id: number;
  title: string;
  overview?: string;
  release_date?: string;
  runtime?: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres?: Array<{ id: number; name: string }>;
}

export interface TmdbOptions {
  readToken?: string;
  apiKey?: string;
  maxPages: number;
  fetchImpl?: typeof fetch;
  /** How long resolved provider ids and genre names are reused. */
  referenceTtlMs?: number;
}

export const normalizeProviderName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\+/g, ' plus')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export class TmdbClient implements CatalogProvider, MetadataProvider {
  readonly id = 'tmdb';
  readonly attribution = 'Streaming availability by JustWatch, via TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.';

  private genres: { at: number; map: Map<number, string> } | null = null;
  private providerIds = new Map<
    string,
    { at: number; byName: Map<string, number[]>; byService: Map<string, number[]> }
  >();
  private readonly referenceTtlMs: number;

  constructor(private readonly opts: TmdbOptions) {
    if (!opts.readToken && !opts.apiKey) throw new Error('TMDB needs a read token or API key');
    this.referenceTtlMs = opts.referenceTtlMs ?? 7 * 86_400_000;
  }

  private get<T>(path: string, params: Record<string, string>, label: string, signal?: AbortSignal): Promise<T> {
    const qs = new URLSearchParams(params);
    const headers: Record<string, string> = {};
    if (this.opts.readToken) headers.authorization = `Bearer ${this.opts.readToken}`;
    else if (this.opts.apiKey) qs.set('api_key', this.opts.apiKey);
    return fetchJson<T>(`${API}${path}?${qs}`, {
      headers,
      label,
      ...(signal ? { signal } : {}),
      ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
    });
  }

  async genreNames(signal?: AbortSignal): Promise<Map<number, string>> {
    if (this.genres && Date.now() - this.genres.at < this.referenceTtlMs) return this.genres.map;
    const data = await this.get<GenreResponse>('/genre/movie/list', { language: 'en-US' }, 'TMDB genres', signal);
    this.genres = { at: Date.now(), map: new Map(data.genres.map((g) => [g.id, g.name])) };
    return this.genres.map;
  }

  /** Provider ids for a service in a region: resolved by name, falling back to the registry. */
  async resolveProviderIds(country: string, service: ServiceDefinition, signal?: AbortSignal): Promise<number[]> {
    let region = this.providerIds.get(country);
    if (!region || Date.now() - region.at >= this.referenceTtlMs) {
      try {
        const data = await this.get<ProvidersResponse>(
          '/watch/providers/movie',
          { watch_region: country, language: 'en-US' },
          `TMDB providers ${country}`,
          signal,
        );
        const byName = new Map<string, number[]>();
        for (const p of data.results ?? []) {
          const name = normalizeProviderName(p.provider_name);
          byName.set(name, [...(byName.get(name) ?? []), p.provider_id]);
        }
        region = { at: Date.now(), byName, byService: new Map() };
        this.providerIds.set(country, region);
      } catch {
        // Reference data is best-effort; the registry's ids are a sound default.
        return [...service.tmdbProviderIds];
      }
    }
    const hit = region.byService.get(service.id);
    if (hit) return hit;
    const resolved = new Set<number>();
    for (const name of service.tmdbNames) {
      for (const id of region.byName.get(normalizeProviderName(name)) ?? []) resolved.add(id);
    }
    const ids = resolved.size > 0 ? [...resolved] : [...service.tmdbProviderIds];
    region.byService.set(service.id, ids);
    return ids;
  }

  async fetchCatalog(country: string, service: ServiceDefinition, signal?: AbortSignal): Promise<ProviderCatalog> {
    const [providerIds, genres] = await Promise.all([
      this.resolveProviderIds(country, service, signal),
      this.genreNames(signal).catch(() => new Map<number, string>()),
    ]);
    const base = {
      watch_region: country,
      with_watch_providers: providerIds.join('|'),
      with_watch_monetization_types: 'flatrate',
      sort_by: 'popularity.desc',
      include_adult: 'false',
      language: 'en-US',
    };
    const label = `TMDB discover ${country}/${service.id}`;
    const first = await this.get<DiscoverResponse>('/discover/movie', { ...base, page: '1' }, label, signal);
    const lastPage = Math.min(first.total_pages, this.opts.maxPages, TMDB_MAX_PAGE);
    const rest = await mapWithConcurrency(
      Array.from({ length: Math.max(0, lastPage - 1) }, (_, i) => i + 2),
      4,
      (page) => this.get<DiscoverResponse>('/discover/movie', { ...base, page: String(page) }, label, signal),
    );

    const seen = new Set<number>();
    const entries: ProviderTitle[] = [];
    for (const page of [first, ...rest]) {
      for (const r of page.results) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        entries.push({
          tmdbId: r.id,
          title: r.title,
          releaseYear: yearOf(r.release_date),
          popularity: r.popularity,
          posterUrl: r.poster_path ? `${IMG}/w342${r.poster_path}` : null,
          backdropUrl: r.backdrop_path ? `${IMG}/w780${r.backdrop_path}` : null,
          genres: r.genre_ids.map((id) => genres.get(id)).filter((g): g is string => !!g),
          // TMDB has no per-service deep links; the watch option falls back to search.
          link: null,
          overview: r.overview || null,
        });
      }
    }
    return { entries, truncated: first.total_pages > lastPage };
  }

  async getMovie(tmdbId: number, signal?: AbortSignal): Promise<TitleMetadata | null> {
    try {
      const m = await this.get<MovieResponse>(`/movie/${tmdbId}`, { language: 'en-US' }, `TMDB movie ${tmdbId}`, signal);
      return {
        tmdbId: m.id,
        title: m.title,
        overview: m.overview || null,
        releaseYear: yearOf(m.release_date),
        runtimeMinutes: m.runtime ?? null,
        posterUrl: m.poster_path ? `${IMG}/w342${m.poster_path}` : null,
        backdropUrl: m.backdrop_path ? `${IMG}/w780${m.backdrop_path}` : null,
        genres: (m.genres ?? []).map((g) => g.name),
      };
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  }
}

function yearOf(date: string | undefined): number | null {
  const y = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(y) && y > 1800 ? y : null;
}
