/**
 * Registry of the subscription streaming services the app understands.
 *
 * One definition feeds every layer:
 * - the catalog engine (Streaming Availability service id, TMDB provider ids),
 * - the WebView navigation allowlist and the extension's content-script matches,
 * - the player adapter used to drive the service's HTML5 video element,
 * - deep links used when in-WebView playback is blocked (DRM, mobile web limits).
 */

/** How the injected controller should drive the service's player. */
export type PlayerAdapterId = 'generic' | 'netflix';

/**
 * How well the service plays inside an embedded mobile WebView.
 * - `supported`: plays with Widevine/FairPlay inside a WebView on most devices.
 * - `limited`: works on some devices; the app offers native fallback up front.
 * - `unsupported`: the service refuses mobile web playback; go straight to native.
 */
export type MobileWebSupport = 'supported' | 'limited' | 'unsupported';

export interface ServiceDefinition {
  /** Stable internal id used in profiles, rooms and the protocol. */
  id: string;
  name: string;
  /** Service id used by the Streaming Availability API (`catalogs=<id>.subscription`). */
  streamingAvailabilityId: string;
  /**
   * Known TMDB / JustWatch watch-provider ids. The server also resolves ids by
   * name at runtime (see `tmdbNames`), because TMDB occasionally re-keys a
   * provider after a rebrand (HBO Max -> Max).
   */
  tmdbProviderIds: readonly number[];
  /** Lower-case provider names as TMDB lists them, used for runtime id resolution. */
  tmdbNames: readonly string[];
  /** Hostnames (and their subdomains) that belong to the service's web player. */
  domains: readonly string[];
  homeUrl: string;
  /** Where to send a user to find a title when the catalog has no direct link. */
  searchUrl: (title: string) => string;
  /** Custom URL scheme that opens the native app, when it is well documented. */
  nativeScheme?: string;
  adapter: PlayerAdapterId;
  mobileWeb: MobileWebSupport;
  /** Countries where the service is sold. `undefined` means broadly international. */
  regions?: readonly string[];
}

const q = encodeURIComponent;

export const SERVICES: readonly ServiceDefinition[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    streamingAvailabilityId: 'netflix',
    tmdbProviderIds: [8],
    tmdbNames: ['netflix'],
    domains: ['netflix.com'],
    homeUrl: 'https://www.netflix.com/browse',
    searchUrl: (t) => `https://www.netflix.com/search?q=${q(t)}`,
    nativeScheme: 'nflx://',
    adapter: 'netflix',
    mobileWeb: 'unsupported',
  },
  {
    id: 'prime',
    name: 'Prime Video',
    streamingAvailabilityId: 'prime',
    tmdbProviderIds: [9, 119],
    tmdbNames: ['amazon prime video', 'prime video'],
    domains: ['primevideo.com', 'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.co.jp'],
    homeUrl: 'https://www.primevideo.com',
    searchUrl: (t) => `https://www.primevideo.com/search/ref=atv_nb_sug?phrase=${q(t)}`,
    adapter: 'generic',
    mobileWeb: 'limited',
  },
  {
    id: 'disney',
    name: 'Disney+',
    streamingAvailabilityId: 'disney',
    tmdbProviderIds: [337],
    tmdbNames: ['disney plus', 'disney+'],
    domains: ['disneyplus.com'],
    homeUrl: 'https://www.disneyplus.com',
    searchUrl: () => 'https://www.disneyplus.com/search',
    nativeScheme: 'disneyplus://',
    adapter: 'generic',
    mobileWeb: 'limited',
  },
  {
    id: 'max',
    name: 'Max',
    streamingAvailabilityId: 'hbo',
    tmdbProviderIds: [1899, 384],
    tmdbNames: ['max', 'hbo max'],
    domains: ['max.com', 'hbomax.com'],
    homeUrl: 'https://play.max.com',
    searchUrl: (t) => `https://play.max.com/search?q=${q(t)}`,
    adapter: 'generic',
    mobileWeb: 'limited',
  },
  {
    id: 'hulu',
    name: 'Hulu',
    streamingAvailabilityId: 'hulu',
    tmdbProviderIds: [15],
    tmdbNames: ['hulu'],
    domains: ['hulu.com'],
    homeUrl: 'https://www.hulu.com/hub/home',
    searchUrl: () => 'https://www.hulu.com/search',
    adapter: 'generic',
    mobileWeb: 'limited',
    regions: ['US'],
  },
  {
    id: 'apple',
    name: 'Apple TV+',
    streamingAvailabilityId: 'apple',
    tmdbProviderIds: [350],
    tmdbNames: ['apple tv plus', 'apple tv+'],
    domains: ['tv.apple.com'],
    homeUrl: 'https://tv.apple.com',
    searchUrl: (t) => `https://tv.apple.com/search?term=${q(t)}`,
    adapter: 'generic',
    mobileWeb: 'limited',
  },
  {
    id: 'paramount',
    name: 'Paramount+',
    streamingAvailabilityId: 'paramount',
    tmdbProviderIds: [531],
    tmdbNames: ['paramount plus', 'paramount+', 'paramount plus premium'],
    domains: ['paramountplus.com'],
    homeUrl: 'https://www.paramountplus.com',
    searchUrl: () => 'https://www.paramountplus.com/search/',
    adapter: 'generic',
    mobileWeb: 'limited',
  },
  {
    id: 'peacock',
    name: 'Peacock',
    streamingAvailabilityId: 'peacock',
    tmdbProviderIds: [386, 387],
    tmdbNames: ['peacock premium', 'peacock', 'peacock premium plus'],
    domains: ['peacocktv.com'],
    homeUrl: 'https://www.peacocktv.com/watch/home',
    searchUrl: () => 'https://www.peacocktv.com/watch/search',
    adapter: 'generic',
    mobileWeb: 'limited',
    regions: ['US'],
  },
  {
    id: 'now',
    name: 'NOW',
    streamingAvailabilityId: 'now',
    tmdbProviderIds: [39],
    tmdbNames: ['now tv', 'now', 'now tv cinema'],
    domains: ['nowtv.com', 'nowtv.it'],
    homeUrl: 'https://www.nowtv.com/watch/home',
    searchUrl: () => 'https://www.nowtv.com/watch/search',
    adapter: 'generic',
    mobileWeb: 'limited',
    regions: ['GB', 'IE', 'IT'],
  },
  {
    id: 'mubi',
    name: 'MUBI',
    streamingAvailabilityId: 'mubi',
    tmdbProviderIds: [11],
    tmdbNames: ['mubi'],
    domains: ['mubi.com'],
    homeUrl: 'https://mubi.com',
    searchUrl: (t) => `https://mubi.com/search/films?query=${q(t)}`,
    adapter: 'generic',
    mobileWeb: 'supported',
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll',
    streamingAvailabilityId: 'crunchyroll',
    tmdbProviderIds: [283],
    tmdbNames: ['crunchyroll'],
    domains: ['crunchyroll.com'],
    homeUrl: 'https://www.crunchyroll.com',
    searchUrl: (t) => `https://www.crunchyroll.com/search?q=${q(t)}`,
    adapter: 'generic',
    mobileWeb: 'supported',
  },
  {
    id: 'stan',
    name: 'Stan',
    streamingAvailabilityId: 'stan',
    tmdbProviderIds: [21],
    tmdbNames: ['stan'],
    domains: ['stan.com.au'],
    homeUrl: 'https://www.stan.com.au',
    searchUrl: () => 'https://www.stan.com.au/search',
    adapter: 'generic',
    mobileWeb: 'limited',
    regions: ['AU'],
  },
];

const SERVICE_BY_ID = new Map(SERVICES.map((s) => [s.id, s]));

export function getService(id: string): ServiceDefinition | undefined {
  return SERVICE_BY_ID.get(id);
}

export function isKnownService(id: string): boolean {
  return SERVICE_BY_ID.has(id);
}

/** Services sold in a given country. */
export function servicesForCountry(country: string): ServiceDefinition[] {
  return SERVICES.filter((s) => !s.regions || s.regions.includes(country));
}

/** True when `hostname` is one of the service's domains or a subdomain of one. */
export function hostnameMatchesService(hostname: string, service: ServiceDefinition): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return service.domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Finds the service a URL belongs to, or `undefined` for any other site. */
export function serviceForUrl(url: string): ServiceDefinition | undefined {
  let hostname: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return undefined;
    hostname = parsed.hostname;
  } catch {
    return undefined;
  }
  return SERVICES.find((s) => hostnameMatchesService(hostname, s));
}

/**
 * Builds the URL that opens a title in the service's native app.
 *
 * Universal links / Android App Links (`https://`) open the installed app and
 * fall back to the website, so they are preferred. A custom scheme is only
 * produced where the title path is well known (Netflix).
 */
export function nativeDeepLink(service: ServiceDefinition, webLink: string): string {
  if (service.id === 'netflix') {
    const match = /netflix\.com\/(?:[a-z-]+\/)?(?:title|watch)\/(\d+)/i.exec(webLink);
    if (match) return `nflx://www.netflix.com/title/${match[1]}`;
  }
  return webLink;
}
