/**
 * Content script for streaming sites. Dormant until the background worker
 * says this tab is in a watch party, then it runs the shared
 * PlayerController against the page's <video> (isolated world: it shares the
 * DOM with the page but none of its JavaScript).
 *
 * Privacy: the controller only touches <video> elements; it never reads
 * inputs, forms, cookies or storage on the streaming site.
 */
import {
  createNetflixAdapter,
  genericAdapter,
  PlayerController,
  validatePlayerCommand,
} from '@watch-party/shared/player';
import type { BackgroundToContent, ContentToBackground } from './messages';

let controller: PlayerController | null = null;
let port: chrome.runtime.Port | null = null;
let retry = 0;

/** Seeks Netflix through the MAIN-world helper (see netflix-main.ts). */
function netflixSeekViaMainWorld(ms: number): boolean {
  delete document.documentElement.dataset.watchpartySeek;
  document.dispatchEvent(new CustomEvent('watchparty:netflix-seek', { detail: String(ms) }));
  // Event dispatch is synchronous across worlds, so the reply is already there.
  return document.documentElement.dataset.watchpartySeek === 'ok';
}

function stopController() {
  controller?.stop();
  controller = null;
}

function connect() {
  try {
    port = chrome.runtime.connect({ name: 'player' });
  } catch {
    return; // extension was reloaded or removed; this script is orphaned
  }
  port.onMessage.addListener((msg: BackgroundToContent) => {
    retry = 0; // the worker answered: the connection is healthy
    switch (msg.type) {
      case 'activate':
        if (!controller) {
          const adapter =
            msg.adapter === 'netflix'
              ? createNetflixAdapter(netflixSeekViaMainWorld)
              : genericAdapter;
          controller = new PlayerController({
            doc: document,
            adapter,
            send: (event) =>
              port?.postMessage({ type: 'event', event } satisfies ContentToBackground),
          });
          controller.start();
        }
        return;
      case 'deactivate':
        stopController();
        return;
      case 'command': {
        const command = validatePlayerCommand(msg.command);
        if (command) controller?.handleCommand(command);
        return;
      }
    }
  });
  port.onDisconnect.addListener(() => {
    // The service worker restarts from time to time; reconnect and let it
    // re-activate us if the tab is still in a party.
    stopController();
    port = null;
    if (!chrome.runtime?.id) return;
    const delay = Math.min(1_000 * 2 ** retry++, 15_000);
    setTimeout(connect, delay);
  });
}

connect();
