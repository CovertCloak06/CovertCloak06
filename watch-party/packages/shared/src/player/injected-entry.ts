/**
 * Entry point bundled into the self-contained script that the mobile app
 * injects into streaming pages (see scripts/build-injected.mjs).
 *
 * Contract with the host:
 * - The host sets `window.__WATCH_PARTY_CONFIG__ = { nonce, adapter }` first.
 * - Page -> host: `window.ReactNativeWebView.postMessage(JSON envelope)`.
 * - Host -> page: `window.__watchParty.receive(JSON envelope)`.
 *
 * Runs in the page's own JavaScript world, which is what allows the Netflix
 * adapter to reach Netflix's player API.
 */
import { createNetflixAdapter, genericAdapter, netflixPageSeek } from './adapters.js';
import { PlayerController } from './controller.js';
import { parsePlayerCommand, wrapPlayerMessage, type PlayerEvent } from './messages.js';

interface InjectedConfig {
  nonce: string;
  adapter: 'generic' | 'netflix';
}

interface WatchPartyGlobal {
  receive(raw: unknown): void;
  stop(): void;
  version: number;
}

declare global {
  interface Window {
    __WATCH_PARTY_CONFIG__?: InjectedConfig;
    __watchParty?: WatchPartyGlobal;
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

(function install() {
  const config = window.__WATCH_PARTY_CONFIG__;
  if (!config || typeof config.nonce !== 'string') return;
  // Navigations inside a single-page app keep the window; never double-install.
  if (window.__watchParty) return;

  const { nonce } = config;
  const send = (event: PlayerEvent) => {
    const bridge = window.ReactNativeWebView;
    if (bridge) bridge.postMessage(JSON.stringify(wrapPlayerMessage(nonce, event)));
  };
  const adapter =
    config.adapter === 'netflix' ? createNetflixAdapter(netflixPageSeek(window)) : genericAdapter;

  const controller = new PlayerController({ doc: document, adapter, send });

  window.__watchParty = {
    version: 1,
    receive(raw) {
      const command = parsePlayerCommand(raw, nonce);
      if (command) controller.handleCommand(command);
    },
    stop() {
      controller.stop();
      delete window.__watchParty;
    },
  };

  const start = () => controller.start();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
