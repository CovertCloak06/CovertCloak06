/**
 * Helpers for the host side of the WebView bridge: build the strings handed to
 * react-native-webview's `injectedJavaScriptBeforeContentLoaded` and
 * `injectJavaScript`.
 */
import { INJECTED_PLAYER_SCRIPT } from '../generated/injected-script.js';
import type { PlayerAdapterId } from '../services.js';
import { wrapPlayerMessage, type PlayerCommand } from './messages.js';

export interface InjectionConfig {
  nonce: string;
  adapter: PlayerAdapterId;
}

/**
 * Script to run before the streaming page's own scripts. Ends in `true;`
 * because WebViews log a warning when an injected script evaluates to a
 * non-serialisable value.
 */
export function buildPlayerInjection(config: InjectionConfig): string {
  const cfg = JSON.stringify({ nonce: config.nonce, adapter: config.adapter });
  return `(function(){try{window.__WATCH_PARTY_CONFIG__=${cfg};${INJECTED_PLAYER_SCRIPT}}catch(e){}})();true;`;
}

/** Script that delivers one command to the injected controller. */
export function buildCommandInjection(nonce: string, command: PlayerCommand): string {
  // Double-encode so the payload is a JS string literal, never evaluated code.
  const literal = JSON.stringify(JSON.stringify(wrapPlayerMessage(nonce, command)));
  return `window.__watchParty&&window.__watchParty.receive(${literal});true;`;
}

/** Cryptographically random nonce for a WebView session. */
export function createNonce(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
