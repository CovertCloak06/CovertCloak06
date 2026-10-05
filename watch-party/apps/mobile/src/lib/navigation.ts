/**
 * Pure decisions for the watch screen's WebView. Kept free of React Native
 * imports so they are unit-testable.
 */
import {
  getService,
  hostnameMatchesService,
  type ServiceDefinition,
  type WatchOption,
} from '@watch-party/shared/client';

export type NavigationDecision = 'allow' | 'external' | 'block';

/**
 * Decides what to do with a navigation inside the streaming WebView.
 *
 * - Top-level pages stay on the chosen service (and its sign-in domains), so
 *   the injected controller only ever runs on the streaming site and a
 *   stray link can't turn the WebView into a general browser.
 * - Sub-frames (DRM license frames, embedded players) are allowed over https.
 * - Other https pages open in the system browser; anything else is blocked.
 */
export function decideNavigation(
  url: string,
  isTopFrame: boolean,
  service: ServiceDefinition,
): NavigationDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'block';
  }
  if (parsed.protocol === 'about:' || parsed.protocol === 'blob:' || parsed.protocol === 'data:') {
    return isTopFrame ? 'block' : 'allow';
  }
  if (parsed.protocol !== 'https:') return 'block';
  if (!isTopFrame) return 'allow';
  const host = parsed.hostname;
  if (hostnameMatchesService(host, service)) return 'allow';
  if (service.authDomains?.some((d) => host === d || host.endsWith(`.${d}`))) return 'allow';
  return 'external';
}

export type PlaybackMode = 'webview' | 'native';

/**
 * Initial playback mode for a watch option (spec rule: deep link into the
 * native app when the service blocks in-WebView playback). The user can
 * always switch manually, and a DRM failure switches automatically.
 */
export function initialPlaybackMode(option: Pick<WatchOption, 'mobileWeb'>): PlaybackMode {
  return option.mobileWeb === 'unsupported' ? 'native' : 'webview';
}

/** Picks the option to load: prefer services that play inside the WebView. */
export function preferredOption(options: readonly WatchOption[]): WatchOption | null {
  const rank = { supported: 0, limited: 1, unsupported: 2 } as const;
  return (
    [...options].sort(
      (a, b) =>
        rank[a.mobileWeb] - rank[b.mobileWeb] || Number(b.directLink) - Number(a.directLink),
    )[0] ?? null
  );
}

/** The player adapter id for a service (Netflix needs its own seek path). */
export function adapterFor(serviceId: string): 'generic' | 'netflix' {
  return getService(serviceId)?.adapter ?? 'generic';
}

/** A desktop Chrome UA for the optional "desktop site" toggle, like any mobile browser offers. */
export const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
