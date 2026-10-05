/**
 * Runs in Netflix's own JavaScript world (manifest `world: "MAIN"`), where
 * Netflix's player API lives. The isolated-world content script asks it to
 * seek with a DOM CustomEvent; the reply is written to a data attribute,
 * which the content script reads synchronously right after dispatching.
 *
 * Deliberately tiny: it only ever seeks, and reads nothing from the page.
 */
import { netflixPageSeek } from '@watch-party/shared/player';

const seek = netflixPageSeek(window);
document.addEventListener('watchparty:netflix-seek', (e) => {
  const ms = Number((e as CustomEvent<string>).detail);
  const ok = Number.isFinite(ms) && ms >= 0 && seek(ms);
  document.documentElement.dataset.watchpartySeek = ok ? 'ok' : 'fail';
});
