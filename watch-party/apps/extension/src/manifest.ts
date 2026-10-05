/**
 * Generates manifest.json from the shared service registry, so the domains
 * the extension may touch are exactly the services the app supports.
 */
import { SERVICES } from '@watch-party/shared/client';

export interface ManifestOptions {
  version: string;
  /** Adds http://localhost / 127.0.0.1 matches for local testing against the dev harness. */
  dev: boolean;
}

export function serviceMatchPatterns(): string[] {
  const patterns = new Set<string>();
  for (const s of SERVICES) {
    for (const d of s.domains) {
      patterns.add(`https://${d}/*`);
      patterns.add(`https://*.${d}/*`);
    }
  }
  return [...patterns].sort();
}

export function buildManifest({ version, dev }: ManifestOptions): chrome.runtime.ManifestV3 {
  const devMatches = dev ? ['http://localhost/*', 'http://127.0.0.1/*'] : [];
  const matches = [...serviceMatchPatterns(), ...devMatches];
  return {
    manifest_version: 3,
    name: dev ? 'Watch Party (dev)' : 'Watch Party',
    short_name: 'Watch Party',
    version,
    description:
      'Watch films in sync with friends in other countries, each on your own streaming subscription.',
    minimum_chrome_version: '116',
    action: { default_popup: 'popup.html', default_title: 'Watch Party' },
    background: { service_worker: 'background.js', type: 'module' },
    // storage: profile, session, server URL. Host permissions: only the
    // streaming services' own sites (to know which service a tab is on).
    permissions: ['storage'],
    host_permissions: matches,
    content_scripts: [
      {
        matches,
        js: ['content.js'],
        run_at: 'document_idle',
        all_frames: false,
      },
      {
        // Netflix must be seeked through its page-world player API.
        matches: ['https://www.netflix.com/*'],
        js: ['netflix-main.js'],
        run_at: 'document_start',
        world: 'MAIN',
      },
    ],
    icons: {
      '16': 'icons/16.png',
      '32': 'icons/32.png',
      '48': 'icons/48.png',
      '128': 'icons/128.png',
    },
  };
}
