import { normalizeCountryCode } from './countries.js';
import { getService, isKnownService, nativeDeepLink, type MobileWebSupport } from './services.js';

/** One user's streaming setup, as described in the product spec. */
export interface UserSubscription {
  userId: string;
  /** ISO 3166-1 alpha-2 country the streaming accounts are registered in. */
  countryCode: string;
  /** Internal service ids, e.g. `['netflix', 'prime', 'disney']`. */
  services: string[];
}

export interface CommonMovieQuery {
  users: UserSubscription[];
}

/**
 * A title available on a subscription (flat-rate) tier of one service in one
 * country. Rent/buy availability is never stored: a title you'd have to pay
 * extra for is not "common".
 */
export interface CatalogEntry {
  /** TMDB movie id: the universal key across catalog providers. */
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  /** Provider popularity score; higher sorts first. */
  popularity: number;
  posterUrl: string | null;
  genres: string[];
  /** Direct link to the title on the service, when the provider supplies one. */
  link: string | null;
}

/** Where and how one user can watch a title. */
export interface WatchOption {
  serviceId: string;
  serviceName: string;
  countryCode: string;
  /** URL to load in the WebView / browser tab. */
  webUrl: string;
  /** URL that opens the native app (universal link or custom scheme). */
  nativeUrl: string;
  /** False when `webUrl` is a search page because no direct link was known. */
  directLink: boolean;
  mobileWeb: MobileWebSupport;
}

export interface TitleMetadata {
  tmdbId: number;
  title: string;
  overview: string | null;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
}

export interface CommonTitle extends TitleMetadata {
  popularity: number;
  /** Watch options keyed by user id; every user in the query has at least one. */
  watchOptions: Record<string, WatchOption[]>;
}

export class InvalidSubscriptionError extends Error {
  override name = 'InvalidSubscriptionError';
}

/**
 * Validates and canonicalises a subscription: normalises the country (UK -> GB),
 * drops duplicate services and rejects unknown ones.
 */
export function normalizeSubscription(sub: UserSubscription): UserSubscription {
  const countryCode = normalizeCountryCode(sub.countryCode);
  if (!countryCode) {
    throw new InvalidSubscriptionError(`Unsupported country "${sub.countryCode}"`);
  }
  const unknown = sub.services.filter((s) => !isKnownService(s));
  if (unknown.length > 0) {
    throw new InvalidSubscriptionError(`Unknown service(s): ${unknown.join(', ')}`);
  }
  const services = [...new Set(sub.services)].sort();
  if (services.length === 0) {
    throw new InvalidSubscriptionError(`User ${sub.userId} has no streaming services`);
  }
  return { userId: sub.userId, countryCode, services };
}

/** Builds the watch option for a user from a catalog entry's link. */
export function buildWatchOption(
  serviceId: string,
  countryCode: string,
  title: string,
  link: string | null,
): WatchOption {
  const service = getService(serviceId);
  if (!service) throw new InvalidSubscriptionError(`Unknown service "${serviceId}"`);
  const webUrl = link ?? service.searchUrl(title);
  return {
    serviceId,
    serviceName: service.name,
    countryCode,
    webUrl,
    nativeUrl: nativeDeepLink(service, webUrl),
    directLink: link !== null,
    mobileWeb: service.mobileWeb,
  };
}

export interface UserCatalogs {
  userId: string;
  countryCode: string;
  /** The user's services, each with its regional flat-rate catalog. */
  catalogs: ReadonlyArray<{ serviceId: string; entries: readonly CatalogEntry[] }>;
}

export interface IntersectedTitle {
  entry: CatalogEntry;
  watchOptions: Record<string, WatchOption[]>;
}

/**
 * Reference implementation of the catalog intersection:
 *
 *   Common = ⋂ over users ( ⋃ over that user's services Catalog(country, service) )
 *
 * A title qualifies when every user can stream it on at least one of their own
 * subscriptions in their own country. Results are ordered by the highest
 * popularity any catalog reported, then by title for stable output.
 *
 * The server performs the same computation with Redis sorted-set operations so
 * full catalogs never leave Redis; this function is the executable spec that
 * the Redis path is tested against, and it is used directly for small inputs.
 */
export function intersectCatalogs(users: readonly UserCatalogs[]): IntersectedTitle[] {
  if (users.length === 0) return [];

  const perUser = users.map((user) => {
    const byTitle = new Map<number, { entry: CatalogEntry; options: WatchOption[] }>();
    for (const { serviceId, entries } of user.catalogs) {
      for (const entry of entries) {
        const option = buildWatchOption(serviceId, user.countryCode, entry.title, entry.link);
        const existing = byTitle.get(entry.tmdbId);
        if (existing) {
          existing.options.push(option);
          if (entry.popularity > existing.entry.popularity) existing.entry = entry;
        } else {
          byTitle.set(entry.tmdbId, { entry, options: [option] });
        }
      }
    }
    return { userId: user.userId, byTitle };
  });

  // Iterate the smallest union to keep the intersection O(min catalog size * users).
  const [smallest, ...rest] = [...perUser].sort((a, b) => a.byTitle.size - b.byTitle.size);
  if (!smallest) return [];

  const results: IntersectedTitle[] = [];
  for (const [tmdbId, first] of smallest.byTitle) {
    if (!rest.every((u) => u.byTitle.has(tmdbId))) continue;
    let best = first.entry;
    const watchOptions: Record<string, WatchOption[]> = {};
    for (const u of perUser) {
      const hit = u.byTitle.get(tmdbId)!;
      watchOptions[u.userId] = hit.options;
      if (hit.entry.popularity > best.popularity) best = hit.entry;
    }
    results.push({ entry: best, watchOptions });
  }

  return results.sort(
    (a, b) => b.entry.popularity - a.entry.popularity || a.entry.title.localeCompare(b.entry.title),
  );
}

/**
 * Stable cache key for a set of subscriptions. Order of users and services
 * does not matter, and user ids are deliberately excluded: two rooms with the
 * same country/service mix share one cached result.
 */
export function subscriptionsCacheKey(users: readonly UserSubscription[]): string {
  return users
    .map((u) => `${u.countryCode}:${[...u.services].sort().join('+')}`)
    .sort()
    .join('|');
}
