/**
 * Catalog & intersection engine (spec module 1).
 *
 * Regional catalogs are fetched per (country, service) from the configured
 * provider and cached in the store as sorted sets of TMDB ids scored by
 * popularity, with a companion hash of direct links:
 *
 *   wp:v1:cat:<provider>:<CC>:<service>:z      ZSET  tmdbId -> popularity
 *   wp:v1:cat:<provider>:<CC>:<service>:links  HASH  tmdbId -> deep link
 *   wp:v1:cat:<provider>:<CC>:<service>:meta   JSON  fetchedAt, expiresAt, count, truncated
 *   wp:v1:title:<tmdbId>                       JSON  title metadata seen in catalogs
 *
 * Intersection never pulls catalogs into Node:
 *
 *   per user:  ZUNIONSTORE union  <user's service catalogs>  AGGREGATE MAX
 *   room:      ZINTERSTORE common <every user's union>       AGGREGATE MAX
 *
 * then pages are read with ZREVRANGE. Caching follows the spec (12-24h TTL,
 * jittered so catalogs don't all expire together) and serves stale data if a
 * refresh fails, so a provider outage degrades freshness rather than the app.
 */
import { createHash } from 'node:crypto';
import {
  buildWatchOption,
  getService,
  normalizeSubscription,
  subscriptionsCacheKey,
  MAX_ROOM_MEMBERS,
  type CommonCatalogResponse,
  type CommonTitle,
  type TitleMetadata,
  type UserSubscription,
  type WatchOption,
} from '@watch-party/shared';
import { mapWithConcurrency } from '../http/fetch-json.js';
import type { Logger } from '../logger.js';
import type { Store } from '../store/types.js';
import type { CatalogProvider, MetadataProvider, ProviderTitle } from './providers/types.js';

const NS = 'wp:v1';
const COMMON_TTL_MS = 10 * 60_000;
const TITLE_TTL_MS = 7 * 86_400_000;
const FETCH_LOCK_MS = 120_000;
/** Stale catalogs are kept this many TTLs so a failed refresh can fall back. */
const STALE_FACTOR = 2;

interface CatalogMeta {
  provider: string;
  fetchedAt: number;
  expiresAt: number;
  count: number;
  truncated: boolean;
}

type StoredTitle = Omit<TitleMetadata, 'tmdbId'> & { tmdbId: number; popularity: number };

export interface CommonQueryOptions {
  page?: number;
  pageSize?: number;
  genre?: string;
  query?: string;
}

export class CatalogUnavailableError extends Error {
  override name = 'CatalogUnavailableError';
}

export interface CatalogServiceOptions {
  store: Store;
  provider: CatalogProvider;
  metadata?: MetadataProvider;
  ttlMs: number;
  logger: Logger;
  now?: () => number;
  random?: () => number;
}

export class CatalogService {
  private readonly store: Store;
  private readonly provider: CatalogProvider;
  private readonly metadata: MetadataProvider | undefined;
  private readonly ttlMs: number;
  private readonly log: Logger;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly inflight = new Map<string, Promise<CatalogMeta>>();

  constructor(opts: CatalogServiceOptions) {
    this.store = opts.store;
    this.provider = opts.provider;
    this.metadata = opts.metadata;
    this.ttlMs = opts.ttlMs;
    this.log = opts.logger.child({ component: 'catalog' });
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
  }

  get providerId(): string {
    return this.provider.id;
  }

  get attribution(): string {
    return this.provider.attribution;
  }

  private catKey(country: string, serviceId: string): string {
    return `${NS}:cat:${this.provider.id}:${country}:${serviceId}`;
  }

  // ---------------------------------------------------------------------------
  // Regional catalogs
  // ---------------------------------------------------------------------------

  /** Makes sure a fresh-enough catalog is in the store and returns its metadata. */
  ensureCatalog(country: string, serviceId: string): Promise<CatalogMeta> {
    const key = this.catKey(country, serviceId);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = this.loadCatalog(country, serviceId, key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async loadCatalog(country: string, serviceId: string, key: string): Promise<CatalogMeta> {
    const metaKey = `${key}:meta`;
    const cached = await this.store.getJSON<CatalogMeta>(metaKey);
    if (cached && cached.expiresAt > this.now()) return cached;

    try {
      // Cross-instance single-flight: whoever holds the lock fetches, the rest
      // re-check the store once it is released.
      return await this.store.withLock(
        `${NS}:lock:cat:${this.provider.id}:${country}:${serviceId}`,
        FETCH_LOCK_MS,
        async () => {
          const again = await this.store.getJSON<CatalogMeta>(metaKey);
          if (again && again.expiresAt > this.now()) return again;
          return this.refreshCatalog(country, serviceId, key);
        },
      );
    } catch (err) {
      if (cached) {
        this.log.warn({ err, country, serviceId }, 'catalog refresh failed; serving stale catalog');
        return cached;
      }
      this.log.error({ err, country, serviceId }, 'catalog fetch failed');
      throw new CatalogUnavailableError(
        `Catalog for ${serviceId} in ${country} is unavailable right now`,
      );
    }
  }

  private async refreshCatalog(
    country: string,
    serviceId: string,
    key: string,
  ): Promise<CatalogMeta> {
    const service = getService(serviceId);
    if (!service) throw new CatalogUnavailableError(`Unknown service ${serviceId}`);
    const started = this.now();
    const { entries, truncated } = await this.provider.fetchCatalog(country, service);

    // Jitter 0.9x-1.1x so catalogs fetched together don't expire together.
    const ttl = Math.round(this.ttlMs * (0.9 + this.random() * 0.2));
    const keepMs = ttl * STALE_FACTOR;
    const links: Record<string, string> = {};
    for (const e of entries) if (e.link) links[String(e.tmdbId)] = e.link;

    await this.store.replaceSortedSet(
      `${key}:z`,
      entries.map((e) => [e.popularity, String(e.tmdbId)]),
      keepMs,
      { key: `${key}:links`, fields: links },
    );
    await this.store.msetJSON(
      entries.map((e) => [`${NS}:title:${e.tmdbId}`, toStoredTitle(e)]),
      Math.max(TITLE_TTL_MS, keepMs),
    );
    const meta: CatalogMeta = {
      provider: this.provider.id,
      fetchedAt: this.now(),
      expiresAt: this.now() + ttl,
      count: entries.length,
      truncated,
    };
    await this.store.setJSON(`${key}:meta`, meta, keepMs);
    this.log.info(
      { country, serviceId, count: entries.length, truncated, ms: this.now() - started },
      'catalog refreshed',
    );
    return meta;
  }

  // ---------------------------------------------------------------------------
  // Intersection
  // ---------------------------------------------------------------------------

  async getCommonTitles(
    rawUsers: UserSubscription[],
    opts: CommonQueryOptions = {},
  ): Promise<CommonCatalogResponse<CommonTitle>> {
    const users = dedupeUsers(rawUsers.map(normalizeSubscription));
    if (users.length === 0) throw new CatalogUnavailableError('No users to intersect');
    if (users.length > MAX_ROOM_MEMBERS) {
      throw new CatalogUnavailableError(`At most ${MAX_ROOM_MEMBERS} users can be intersected`);
    }
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const pageSize = Math.min(Math.max(1, Math.floor(opts.pageSize ?? 20)), 100);

    const pairs = new Map<string, [string, string]>();
    for (const u of users)
      for (const s of u.services) pairs.set(`${u.countryCode}:${s}`, [u.countryCode, s]);
    const metas = await mapWithConcurrency([...pairs.values()], 4, ([c, s]) =>
      this.ensureCatalog(c, s),
    );
    const partial = metas.some((m) => m.truncated);

    const commonKey = await this.computeCommonSet(users);

    let ids: string[];
    let total: number;
    const genre = opts.genre?.trim().toLowerCase();
    const query = opts.query ? fold(opts.query) : '';
    if (genre || query) {
      const all = await this.store.zrevrange(commonKey, 0, -1);
      const titles = await this.store.mgetJSON<StoredTitle>(all.map((id) => `${NS}:title:${id}`));
      const matching = all.filter((_, i) => {
        const t = titles[i];
        if (!t) return false;
        if (genre && !t.genres.some((g) => g.toLowerCase() === genre)) return false;
        if (query && !fold(t.title).includes(query)) return false;
        return true;
      });
      total = matching.length;
      ids = matching.slice((page - 1) * pageSize, page * pageSize);
    } else {
      total = await this.store.zcard(commonKey);
      ids = await this.store.zrevrange(commonKey, (page - 1) * pageSize, page * pageSize - 1);
    }

    const results = await this.buildTitles(ids.map(Number), users);
    return { results, page, pageSize, totalResults: total, partial, provider: this.provider.id };
  }

  private async computeCommonSet(users: UserSubscription[]): Promise<string> {
    const digest = createHash('sha1').update(subscriptionsCacheKey(users)).digest('hex');
    const commonKey = `${NS}:common:${this.provider.id}:${digest}`;
    if (await this.store.exists(commonKey)) return commonKey;

    const unionKeys = await Promise.all(
      users.map(async (u) => {
        const key = `${NS}:union:${this.provider.id}:${u.countryCode}:${u.services.join('+')}`;
        await this.store.zunionStore(
          key,
          u.services.map((s) => `${this.catKey(u.countryCode, s)}:z`),
          'MAX',
          COMMON_TTL_MS,
        );
        return key;
      }),
    );
    await this.store.zinterStore(commonKey, unionKeys, 'MAX', COMMON_TTL_MS);
    return commonKey;
  }

  /** Watch options for one title for each user (empty array where unavailable). */
  async watchOptionsFor(
    tmdbId: number,
    rawUsers: UserSubscription[],
  ): Promise<Record<string, WatchOption[]>> {
    const users = dedupeUsers(rawUsers.map(normalizeSubscription));
    await mapWithConcurrency(
      [...new Set(users.flatMap((u) => u.services.map((s) => `${u.countryCode}:${s}`)))],
      4,
      (pair) => {
        const [c, s] = pair.split(':') as [string, string];
        return this.ensureCatalog(c, s);
      },
    );
    const [details] = await this.buildTitles([tmdbId], users, { requireEveryone: false });
    if (details) return details.watchOptions;
    return Object.fromEntries(users.map((u) => [u.userId, []]));
  }

  /** Full metadata for a title (store first, then TMDB). */
  async getTitle(tmdbId: number): Promise<TitleMetadata | null> {
    const [t] = await this.enrich([tmdbId]);
    return t ?? null;
  }

  private async buildTitles(
    ids: number[],
    users: UserSubscription[],
    { requireEveryone = true } = {},
  ): Promise<CommonTitle[]> {
    if (ids.length === 0) return [];
    const idStrings = ids.map(String);
    const titles = await this.enrich(ids);

    // One ZMSCORE + HMGET per (country, service) for the whole page.
    const availability = new Map<
      string,
      { scores: Array<number | null>; links: Array<string | null> }
    >();
    await Promise.all(
      users.flatMap((u) =>
        u.services.map(async (s) => {
          const key = this.catKey(u.countryCode, s);
          const [scores, links] = await Promise.all([
            this.store.zmscore(`${key}:z`, idStrings),
            this.store.hmget(`${key}:links`, idStrings),
          ]);
          availability.set(`${u.countryCode}:${s}`, { scores, links });
        }),
      ),
    );

    const out: CommonTitle[] = [];
    ids.forEach((tmdbId, i) => {
      const meta = titles[i];
      if (!meta) return;
      let popularity = 0;
      const watchOptions: Record<string, WatchOption[]> = {};
      for (const u of users) {
        const options: WatchOption[] = [];
        for (const s of u.services) {
          const a = availability.get(`${u.countryCode}:${s}`)!;
          const score = a.scores[i];
          if (score === null || score === undefined) continue;
          popularity = Math.max(popularity, score);
          options.push(buildWatchOption(s, u.countryCode, meta.title, a.links[i] ?? null));
        }
        watchOptions[u.userId] = options;
      }
      if (requireEveryone && users.some((u) => watchOptions[u.userId]!.length === 0)) return;
      out.push({ ...meta, popularity, watchOptions });
    });
    return out;
  }

  /**
   * Title metadata for ids, preferring what catalogs stored and filling
   * runtime/overview/backdrop from TMDB (cached 7 days) when available.
   */
  private async enrich(ids: number[]): Promise<Array<TitleMetadata | null>> {
    const stored = await this.store.mgetJSON<StoredTitle>(ids.map((id) => `${NS}:title:${id}`));
    const details = this.metadata
      ? await this.store.mgetJSON<TitleMetadata>(ids.map((id) => `${NS}:details:${id}`))
      : ids.map(() => null);

    const missing = ids.filter((_, i) => {
      const s = stored[i];
      return (
        !details[i] &&
        (!s || s.runtimeMinutes === null || s.overview === null || s.posterUrl === null)
      );
    });
    const fetched = new Map<number, TitleMetadata>();
    if (this.metadata && missing.length > 0) {
      await mapWithConcurrency(missing, 4, async (id) => {
        try {
          const m = await this.metadata!.getMovie(id);
          if (m) {
            fetched.set(id, m);
            await this.store.setJSON(`${NS}:details:${id}`, m, TITLE_TTL_MS);
          }
        } catch (err) {
          this.log.debug({ err, tmdbId: id }, 'metadata enrichment failed');
        }
      });
    }

    return ids.map((id, i) => {
      const s = stored[i] ?? null;
      const d = details[i] ?? fetched.get(id) ?? null;
      if (!s && !d) return null;
      return {
        tmdbId: id,
        title: s?.title ?? d!.title,
        overview: s?.overview ?? d?.overview ?? null,
        releaseYear: s?.releaseYear ?? d?.releaseYear ?? null,
        runtimeMinutes: s?.runtimeMinutes ?? d?.runtimeMinutes ?? null,
        posterUrl: s?.posterUrl ?? d?.posterUrl ?? null,
        backdropUrl: s?.backdropUrl ?? d?.backdropUrl ?? null,
        genres: s?.genres.length ? s.genres : (d?.genres ?? []),
      };
    });
  }
}

function toStoredTitle(e: ProviderTitle): StoredTitle {
  return {
    tmdbId: e.tmdbId,
    title: e.title,
    overview: e.overview ?? null,
    releaseYear: e.releaseYear,
    runtimeMinutes: e.runtimeMinutes ?? null,
    posterUrl: e.posterUrl,
    backdropUrl: e.backdropUrl ?? null,
    genres: e.genres,
    popularity: e.popularity,
  };
}

function dedupeUsers(users: UserSubscription[]): UserSubscription[] {
  const byId = new Map<string, UserSubscription>();
  for (const u of users) byId.set(u.userId, u);
  return [...byId.values()];
}

/** Lower-case and strip diacritics so "amelie" finds "Amélie". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
