import type { CatalogEntry, TitleMetadata } from '@watch-party/shared';
import type { ServiceDefinition } from '@watch-party/shared';

/** A catalog entry plus whatever extra metadata the provider happens to return. */
export interface ProviderTitle extends CatalogEntry {
  overview?: string | null;
  runtimeMinutes?: number | null;
  backdropUrl?: string | null;
}

export interface ProviderCatalog {
  entries: ProviderTitle[];
  /** True when the page budget ran out before the provider's last page. */
  truncated: boolean;
}

/**
 * A source of regional subscription catalogs. Implementations must only
 * return flat-rate (subscription) availability, never rent/buy.
 */
export interface CatalogProvider {
  readonly id: string;
  /** Attribution the client must display (e.g. "Data from JustWatch via TMDB"). */
  readonly attribution: string;
  fetchCatalog(country: string, service: ServiceDefinition, signal?: AbortSignal): Promise<ProviderCatalog>;
}

/** Optional metadata enrichment (TMDB) for runtime, overview and artwork. */
export interface MetadataProvider {
  getMovie(tmdbId: number, signal?: AbortSignal): Promise<TitleMetadata | null>;
}
