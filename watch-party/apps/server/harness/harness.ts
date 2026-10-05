/**
 * Dev harness: emulates the mobile app's watch screen in a plain browser tab.
 *
 * It wires exactly the production pieces together:
 *   - the bundled INJECTED_PLAYER_SCRIPT (loaded as /dev/injected.js),
 *   - a fake `window.ReactNativeWebView` bridge, the same contract the
 *     React Native WebView provides,
 *   - the shared RoomSyncClient over a real Socket.io connection.
 *
 * Open two tabs on /dev/?room=CODE to watch them stay in sync. Playwright's
 * e2e suite drives this page.
 */
import { RoomSyncClient, parsePlayerEvent, wrapPlayerMessage, type PlayerCommand } from '@watch-party/shared/client';
import { io } from 'socket.io-client';

declare global {
  interface Window {
    __WATCH_PARTY_CONFIG__?: { nonce: string; adapter: 'generic' | 'netflix' };
    __watchParty?: { receive(raw: unknown): void };
    ReactNativeWebView?: { postMessage(message: string): void };
    harness?: { client: RoomSyncClient; video: HTMLVideoElement; roomId: string; userId: string; log: string[] };
  }
}

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logLines: string[] = [];
function log(line: string) {
  const entry = `${new Date().toISOString().slice(11, 23)} ${line}`;
  logLines.push(entry);
  const el = $('log');
  el.textContent = logLines.slice(-60).reverse().join('\n');
}

async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function main() {
  const name = params.get('name') ?? `Tester ${Math.floor(Math.random() * 100)}`;
  const country = params.get('country') ?? 'US';
  const services = (params.get('services') ?? 'netflix,prime').split(',');

  const session = await api<{ userId: string; token: string }>('/api/session', { method: 'POST' });
  let roomId = params.get('room')?.toUpperCase();
  if (!roomId) {
    roomId = (await api<{ roomId: string }>('/api/rooms', { method: 'POST', token: session.token })).roomId;
    history.replaceState(null, '', `?room=${roomId}&name=${encodeURIComponent(name)}`);
  }
  $('room').textContent = roomId;
  $('share').setAttribute('href', `/dev/?room=${roomId}`);

  const socket = io({ auth: { token: session.token }, transports: ['websocket'] });
  const client = new RoomSyncClient({
    socket,
    roomId,
    userId: session.userId,
    profile: { country, services, displayName: name },
  });

  const video = $<HTMLVideoElement>('video');
  window.harness = { client, video, roomId, userId: session.userId, log: logLines };

  client.on('state', (s) => {
    $('members').innerHTML = '';
    for (const m of s.members) {
      const li = document.createElement('li');
      li.textContent = `${m.userId === s.hostId ? '★ ' : ''}${m.displayName} (${m.countryCode}) — ${m.status}${m.connected ? '' : ' [offline]'}`;
      li.dataset.userId = m.userId;
      $('members').appendChild(li);
    }
    $('role').textContent = client.isHost ? 'host' : 'guest';
    ($('hostOnly') as HTMLInputElement).checked = s.settings.hostOnlyControl;
  });
  client.on('remoteAction', (a) => log(`remote ${a.action} @ ${a.timecode.toFixed(2)} from ${a.senderId}`));
  client.on('drift', (d) => ($('drift').textContent = d === null ? '–' : `${(d * 1000).toFixed(0)} ms`));
  client.on('error', (e) => log(`error ${e.code}: ${e.message}`));
  client.on('autoplayBlocked', () => log('autoplay blocked: press play to rejoin'));
  client.on('scheduled', (s) => log(`start scheduled at ${s.timecode}s in ${Math.round(s.startAtLocal - Date.now())} ms`));
  client.on('connection', (c) => log(`socket ${c}`));

  await new Promise<void>((resolve) => (socket.connected ? resolve() : socket.once('connect', () => resolve())));
  await client.join();
  log(`joined ${roomId} as ${session.userId} (clock offset ${client.clock.offsetMs.toFixed(1)} ms)`);

  // --- WebView emulation -------------------------------------------------------
  const nonce = crypto.getRandomValues(new Uint32Array(4)).join('-');
  window.ReactNativeWebView = {
    postMessage(raw) {
      const event = parsePlayerEvent(raw, nonce);
      if (!event) return;
      if (event.type === 'PLAYER_EVENT') log(`local ${event.action} @ ${event.timecode.toFixed(2)}`);
      client.handlePlayerEvent(event);
    },
  };
  window.__WATCH_PARTY_CONFIG__ = { nonce, adapter: 'generic' };
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/dev/injected.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load injected controller'));
    document.head.appendChild(s);
  });
  client.attachPlayer({
    send(command: PlayerCommand) {
      window.__watchParty?.receive(JSON.stringify(wrapPlayerMessage(nonce, command)));
    },
  });

  $('makeHost').addEventListener('click', () => {
    const other = client.state?.members.find((m) => m.userId !== client.userId);
    if (other) void client.transferHost(other.userId).catch((e) => log(String(e)));
  });
  $('hostOnly').addEventListener('change', (e) => {
    void client.setHostOnlyControl((e.target as HTMLInputElement).checked).catch((err) => log(String(err)));
  });
  $('countdown').addEventListener('click', () => {
    void client.scheduleStart(video.currentTime, 3_000).catch((e) => log(String(e)));
  });
  document.body.dataset.ready = 'true';
}

main().catch((err) => {
  log(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  document.body.dataset.ready = 'error';
});
