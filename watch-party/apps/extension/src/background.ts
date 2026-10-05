/**
 * Background service worker: owns the watch party session and one room
 * connection per tab.
 *
 *   popup  --sendMessage-->  background  <--port "player"-->  content script
 *                               |
 *                          Socket.io (RoomSyncClient per tab)
 *
 * MV3 workers are stopped when idle. An open WebSocket with traffic (Socket.io
 * pings every 10s) keeps the worker alive in Chrome 116+, and tab -> room
 * assignments are mirrored to chrome.storage.session so a restarted worker
 * rejoins rooms when content scripts reconnect.
 */
import {
  RoomSyncClient,
  serviceForUrl,
  validatePlayerEvent,
  type ProtocolError,
  type RoomState,
  type SessionResponse,
  type WatchOption,
} from '@watch-party/shared/client';
import { io, type Socket } from 'socket.io-client';
import type {
  BackgroundToContent,
  CatalogPage,
  ContentToBackground,
  PopupRequest,
  PopupResponse,
  PopupStatus,
  Profile,
  RoomInfo,
  TabInfo,
} from './messages';

const DEFAULT_SERVER = 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Persistent settings
// ---------------------------------------------------------------------------

async function getServerUrl(): Promise<string> {
  const { serverUrl } = await chrome.storage.local.get('serverUrl');
  return typeof serverUrl === 'string' && serverUrl ? serverUrl.replace(/\/+$/, '') : DEFAULT_SERVER;
}

async function getProfile(): Promise<Profile | null> {
  const { profile } = await chrome.storage.local.get('profile');
  return profile && typeof profile === 'object' ? (profile as Profile) : null;
}

async function getSession(): Promise<SessionResponse> {
  const server = await getServerUrl();
  const { session } = await chrome.storage.local.get('session');
  const s = session as (SessionResponse & { server?: string }) | undefined;
  if (s && s.server === server && s.expiresAt - Date.now() > 2 * 86_400_000) return s;
  const res = await fetch(`${server}/api/session`, { method: 'POST' });
  if (!res.ok) throw new Error(`Could not start a session (HTTP ${res.status})`);
  const fresh = (await res.json()) as SessionResponse;
  await chrome.storage.local.set({ session: { ...fresh, server } });
  return fresh;
}

async function api<T>(path: string, init: { method?: string; token: string }): Promise<T> {
  const server = await getServerUrl();
  const res = await fetch(`${server}${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${init.token}`, accept: 'application/json' },
  });
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

// ---------------------------------------------------------------------------
// Tab sessions
// ---------------------------------------------------------------------------

interface TabSession {
  tabId: number;
  roomId: string;
  userId: string;
  token: string;
  socket: Socket;
  client: RoomSyncClient;
  connection: RoomInfo['connection'];
  drift: number | null;
  error: ProtocolError | null;
  lastSelectionAt: number | null;
}

const sessions = new Map<number, TabSession>();
const playerPorts = new Map<number, chrome.runtime.Port>();
const popupPorts = new Set<chrome.runtime.Port>();

async function rememberRooms(): Promise<void> {
  const rooms: Record<string, string> = {};
  for (const [tabId, s] of sessions) rooms[String(tabId)] = s.roomId;
  await chrome.storage.session.set({ rooms });
}

async function rememberedRoom(tabId: number): Promise<string | null> {
  const { rooms } = await chrome.storage.session.get('rooms');
  return (rooms as Record<string, string> | undefined)?.[String(tabId)] ?? null;
}

function adapterForTab(tabId: number): Promise<'generic' | 'netflix'> {
  return chrome.tabs
    .get(tabId)
    .then((tab) => (tab.url && serviceForUrl(tab.url)?.adapter) || 'generic')
    .catch(() => 'generic' as const);
}

async function attachPlayer(session: TabSession): Promise<void> {
  const port = playerPorts.get(session.tabId);
  if (!port) return;
  port.postMessage({ type: 'activate', adapter: await adapterForTab(session.tabId) } satisfies BackgroundToContent);
  session.client.attachPlayer({
    send: (command) => port.postMessage({ type: 'command', command } satisfies BackgroundToContent),
  });
}

async function startRoom(tabId: number, roomId: string): Promise<TabSession> {
  const existing = sessions.get(tabId);
  if (existing) {
    if (existing.roomId === roomId) return existing;
    endRoom(tabId, true);
  }
  const [profile, session, server] = await Promise.all([getProfile(), getSession(), getServerUrl()]);
  if (!profile) throw new Error('Set up your profile first');

  const socket = io(server, { auth: { token: session.token }, transports: ['websocket'] });
  const client = new RoomSyncClient({
    socket,
    roomId,
    userId: session.userId,
    profile: { country: profile.country, services: profile.services, displayName: profile.displayName },
  });
  const tab: TabSession = {
    tabId,
    roomId: roomId.toUpperCase(),
    userId: session.userId,
    token: session.token,
    socket,
    client,
    connection: 'connecting',
    drift: null,
    error: null,
    lastSelectionAt: null,
  };
  sessions.set(tabId, tab);

  client.on('state', (state) => {
    void followSelection(tab, state);
    pushStatus();
  });
  client.on('drift', (d) => {
    tab.drift = d;
    pushStatus();
  });
  client.on('error', (e) => {
    tab.error = e;
    pushStatus();
  });
  client.on('connection', (c) => {
    tab.connection = c === 'connected' ? 'connected' : 'reconnecting';
    pushStatus();
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Could not reach the watch party server')), 10_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Connection failed: ${err.message}`));
    });
  }).catch((err) => {
    endRoom(tabId, false);
    throw err;
  });

  try {
    const state = await client.join();
    tab.connection = 'connected';
    tab.lastSelectionAt = state.selection?.selectedAt ?? null;
  } catch (err) {
    endRoom(tabId, false);
    throw err;
  }
  await rememberRooms();
  await attachPlayer(tab);
  pushStatus();
  return tab;
}

function endRoom(tabId: number, leave: boolean): void {
  const s = sessions.get(tabId);
  if (!s) return;
  sessions.delete(tabId);
  if (leave) s.client.leave();
  else s.client.dispose();
  s.socket.disconnect();
  playerPorts.get(tabId)?.postMessage({ type: 'deactivate' } satisfies BackgroundToContent);
  void rememberRooms();
  pushStatus();
}

/** When the host picks a film, take this member's tab to their own service's page for it. */
async function followSelection(tab: TabSession, state: RoomState): Promise<void> {
  const sel = state.selection;
  if (!sel || sel.selectedAt === tab.lastSelectionAt) return;
  tab.lastSelectionAt = sel.selectedAt;
  const option = pickOption(sel.watchOptions[tab.userId] ?? []);
  if (option) await chrome.tabs.update(tab.tabId, { url: option.webUrl }).catch(() => undefined);
}

function pickOption(options: WatchOption[]): WatchOption | null {
  return [...options].sort((a, b) => Number(b.directLink) - Number(a.directLink))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    popupPorts.add(port);
    port.onDisconnect.addListener(() => popupPorts.delete(port));
    return;
  }
  if (port.name !== 'player') return;
  const tabId = port.sender?.tab?.id;
  if (tabId === undefined || port.sender?.frameId !== 0) {
    port.disconnect();
    return;
  }
  playerPorts.set(tabId, port);
  port.onMessage.addListener((msg: ContentToBackground) => {
    if (msg?.type !== 'event') return;
    const event = validatePlayerEvent(msg.event);
    if (event) sessions.get(tabId)?.client.handlePlayerEvent(event);
  });
  port.onDisconnect.addListener(() => {
    if (playerPorts.get(tabId) === port) playerPorts.delete(tabId);
    sessions.get(tabId)?.client.detachPlayer();
    pushStatus();
  });

  const session = sessions.get(tabId);
  if (session) {
    void attachPlayer(session).then(pushStatus);
  } else {
    // Worker restarted: rejoin the room this tab was in.
    void rememberedRoom(tabId).then((roomId) => {
      if (roomId) void startRoom(tabId, roomId).catch(() => undefined);
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => endRoom(tabId, true));

// ---------------------------------------------------------------------------
// Popup API
// ---------------------------------------------------------------------------

async function tabInfo(tabId: number | null): Promise<TabInfo | null> {
  if (tabId === null) return null;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return null;
  const service = tab.url ? serviceForUrl(tab.url) : undefined;
  return { id: tabId, url: tab.url ?? null, serviceId: service?.id ?? null, serviceName: service?.name ?? null };
}

let attribution: string | null = null;

async function status(tabId: number | null): Promise<PopupStatus> {
  const [profile, serverUrl, tab] = await Promise.all([getProfile(), getServerUrl(), tabInfo(tabId)]);
  if (attribution === null) {
    attribution = await fetch(`${serverUrl}/api/meta`)
      .then((r) => r.json() as Promise<{ attribution: string }>)
      .then((m) => m.attribution)
      .catch(() => null);
  }
  const s = tabId !== null ? sessions.get(tabId) : undefined;
  return {
    profile,
    serverUrl,
    tab,
    attribution,
    room: s
      ? {
          roomId: s.roomId,
          state: s.client.state,
          connection: s.connection,
          drift: s.drift,
          isHost: s.client.isHost,
          userId: s.userId,
          playerAttached: playerPorts.has(s.tabId),
          error: s.error,
        }
      : null,
  };
}

function pushStatus(): void {
  for (const port of popupPorts) port.postMessage({ type: 'changed' });
}

function requireSession(tabId: number): TabSession {
  const s = sessions.get(tabId);
  if (!s) throw new Error('This tab is not in a watch party');
  return s;
}

async function handle(req: PopupRequest): Promise<unknown> {
  switch (req.type) {
    case 'status':
      return status(req.tabId);
    case 'saveProfile':
      await chrome.storage.local.set({ profile: req.profile });
      return null;
    case 'saveServer': {
      const url = new URL(req.url); // throws on garbage
      if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        throw new Error('Use https:// for remote servers');
      }
      await chrome.storage.local.set({ serverUrl: url.origin });
      attribution = null;
      return null;
    }
    case 'createRoom': {
      const session = await getSession();
      const { roomId } = await api<{ roomId: string }>('/api/rooms', { method: 'POST', token: session.token });
      await startRoom(req.tabId, roomId);
      return { roomId };
    }
    case 'joinRoom':
      await startRoom(req.tabId, req.roomId.trim().toUpperCase());
      return null;
    case 'leaveRoom':
      endRoom(req.tabId, true);
      return null;
    case 'setHostOnly':
      return requireSession(req.tabId).client.setHostOnlyControl(req.value);
    case 'transferHost':
      return requireSession(req.tabId).client.transferHost(req.userId);
    case 'countdown': {
      const s = requireSession(req.tabId);
      return s.client.scheduleStart(Math.max(0, s.client.roomTimecode() ?? 0), 5_000);
    }
    case 'catalog': {
      const s = requireSession(req.tabId);
      const qs = new URLSearchParams({ page: String(req.page), pageSize: '20' });
      if (req.query) qs.set('query', req.query);
      return api<CatalogPage>(`/api/rooms/${s.roomId}/catalog?${qs}`, { token: s.token });
    }
    case 'selectTitle':
      return requireSession(req.tabId).client.selectTitle(req.tmdbId);
    case 'openOption': {
      if (!serviceForUrl(req.url)) throw new Error('Not a streaming service link');
      await chrome.tabs.update(req.tabId, { url: req.url });
      return null;
    }
  }
}

chrome.runtime.onMessage.addListener((req: PopupRequest, sender, sendResponse: (r: PopupResponse) => void) => {
  // Only our own extension pages (the popup, even when opened in a tab) may
  // drive the background. Content scripts run on streaming sites' URLs and
  // talk over the "player" port instead.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  handle(req)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  return true; // async response
});

// Test hook for the extension e2e suite (dev builds only).
declare const __DEV__: boolean;
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  (globalThis as unknown as { watchParty: unknown }).watchParty = { handle, sessions };
}
