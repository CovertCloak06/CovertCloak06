/**
 * Streaming Availability API (Movie of the Night) v4, via RapidAPI or direct.
 *
 * GET /shows/search/filters?country=gb&catalogs=netflix.subscription&show_type=movie
 *     &order_by=popularity_1year&cursor=...
 *
 * The `.subscription` catalog suffix restricts results to flat-rate
 * availability, and each show's `streamingOptions[country]` is filtered again
 * to `type === "subscription"` so add-on channels and rentals never leak in.
 */
import type { ServiceDefinition } from '@watch-party/shared';
import { fetchJson } from '../../http/fetch-json.js';
import type { CatalogProvider, ProviderCatalog, ProviderTitle } from './types.js';

interface SaImageSet {
  verticalPoster?: Record<string, string>;
  horizontalBackdrop?: Record<string, string>;
}
export interface SaStreamingOption {
  service: { id: string };
  type: 'subscription' | 'free' | 'rent' | 'buy' | 'addon';
  link?: string;
  videoLink?: string;
}
export interface SaShow {
  id: string;
  showType?: string;
  tmdbId?: string;
  title: string;
  overview?: string;
  releaseYear?: number;
  runtime?: number;
  genres?: Array<{ id: string; name: string }>;
  rating?: number;
  imageSet?: SaImageSet;
  streamingOptions?: Record<string, SaStreamingOption[]>;
}
export interface SaSearchResponse {
  shows: SaShow[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface StreamingAvailabilityOptions {
  apiKey: string;
  mode: 'rapidapi' | 'direct';
  maxPages: number;
  fetchImpl?: typeof fetch;
}

const RAPIDAPI_HOST = 'streaming-availability.p.rapidapi.com';
const DIRECT_BASE = 'https://api.movieofthenight.com/v4';

/** "movie/550" -> 550; anything else (series, malformed) -> null. */
export function parseSaTmdbId(raw: string | undefined): number | null {
  const match = raw ? /^movie\/(\d+)$/.exec(raw) : null;
  return match ? Number(match[1]) : null;
}

export class StreamingAvailabilityProvider implements CatalogProvider {
  readonly id = 'streaming-availability';
  readonly attribution = 'Streaming data from the Streaming Availability API (Movie of the Night)';

  private readonly base: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly opts: StreamingAvailabilityOptions) {
    if (opts.mode === 'rapidapi') {
      this.base = `https://${RAPIDAPI_HOST}`;
      this.headers = { 'X-RapidAPI-Key': opts.apiKey, 'X-RapidAPI-Host': RAPIDAPI_HOST };
    } else {
      this.base = DIRECT_BASE;
      this.headers = { 'X-API-Key': opts.apiKey };
    }
  }

  async fetchCatalog(
    country: string,
    service: ServiceDefinition,
    signal?: AbortSignal,
  ): Promise<ProviderCatalog> {
    const cc = country.toLowerCase();
    const entries: ProviderTitle[] = [];
    const seen = new Set<number>();
    let cursor: string | undefined;
    let page = 0;
    let truncated = false;

    for (;;) {
      const params = new URLSearchParams({
        country: cc,
        catalogs: `${service.streamingAvailabilityId}.subscription`,
        show_type: 'movie',
        order_by: 'popularity_1year',
        output_language: 'en',
      });
      if (cursor) params.set('cursor', cursor);
      const data = await fetchJson<SaSearchResponse>(
        `${this.base}/shows/search/filters?${params.toString()}`,
        {
          headers: this.headers,
          label: `Streaming Availability ${country}/${service.id}`,
          ...(signal ? { signal } : {}),
          ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
        },
      );
      page++;

      for (const show of data.shows ?? []) {
        const tmdbId = parseSaTmdbId(show.tmdbId);
        if (tmdbId === null || seen.has(tmdbId)) continue;
        const option = (show.streamingOptions?.[cc] ?? []).find(
          (o) => o.type === 'subscription' && o.service.id === service.streamingAvailabilityId,
        );
        if (!option) continue;
        seen.add(tmdbId);
        entries.push({
          tmdbId,
          title: show.title,
          releaseYear: show.releaseYear ?? null,
          popularity: 0, // assigned from rank below
          posterUrl: pickImage(show.imageSet?.verticalPoster, ['w360', 'w480', 'w240']),
          backdropUrl: pickImage(show.imageSet?.horizontalBackdrop, ['w720', 'w1080', 'w480']),
          genres: (show.genres ?? []).map((g) => g.name),
          // videoLink drops the user straight into the player; link is the title page.
          link: option.videoLink ?? option.link ?? null,
          overview: show.overview ?? null,
          runtimeMinutes: show.runtime ?? null,
        });
      }

      if (!data.hasMore || !data.nextCursor) break;
      if (page >= this.opts.maxPages) {
        truncated = true;
        break;
      }
      cursor = data.nextCursor;
    }

    // Results arrive in popularity order but carry no score. Convert rank to a
    // percentile (1000 = most popular) so catalogs of different sizes merge
    // fairly when the store takes the MAX across a user's services.
    const n = entries.length;
    entries.forEach((e, i) => (e.popularity = Math.round(1000 * (1 - i / n) * 100) / 100));
    return { entries, truncated };
  }
}

function pickImage(set: Record<string, string> | undefined, prefs: string[]): string | null {
  if (!set) return null;
  for (const p of prefs) if (set[p]) return set[p];
  return Object.values(set)[0] ?? null;
}
