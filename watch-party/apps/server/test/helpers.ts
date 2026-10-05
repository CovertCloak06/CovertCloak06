import type { ServiceDefinition } from '@watch-party/shared';
import { io as connect, type Socket } from 'socket.io-client';
import { createApp, type App, type AppOverrides } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import type {
  CatalogProvider,
  ProviderCatalog,
  ProviderTitle,
} from '../src/catalog/providers/types.js';

export const silentLogger = createLogger('silent');

export function testConfig(extra: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'x'.repeat(40),
    LOG_LEVEL: 'silent',
    MEMBER_GRACE_MS: '300',
    DEV_HARNESS: '0',
    ...extra,
  });
}

export interface RunningApp {
  app: App;
  url: string;
  close(): Promise<void>;
}

export async function startApp(
  overrides: AppOverrides = {},
  env: Record<string, string> = {},
): Promise<RunningApp> {
  const app = createApp(testConfig(env), silentLogger, overrides);
  const port = await app.listen(0, '127.0.0.1');
  return { app, url: `http://127.0.0.1:${port}`, close: () => app.close() };
}

export async function newSession(url: string): Promise<{ userId: string; token: string }> {
  const res = await fetch(`${url}/api/session`, { method: 'POST' });
  return (await res.json()) as { userId: string; token: string };
}

export async function createRoom(url: string, token: string): Promise<string> {
  const res = await fetch(`${url}/api/rooms`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  return ((await res.json()) as { roomId: string }).roomId;
}

export async function connectSocket(url: string, token: string | undefined): Promise<Socket> {
  const socket = connect(url, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
  });
  return socket;
}

/** Resolves with the next payload of `event` on `socket`. */
export function nextEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 3_000,
  filter: (p: T) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: T) => {
      if (!filter(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

/** Asserts that `event` does NOT arrive within `ms`. */
export async function noEvent(socket: Socket, event: string, ms = 300): Promise<void> {
  let got: unknown;
  const handler = (p: unknown) => (got = p);
  socket.on(event, handler);
  await new Promise((r) => setTimeout(r, ms));
  socket.off(event, handler);
  if (got !== undefined) throw new Error(`unexpected ${event}: ${JSON.stringify(got)}`);
}

export function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return socket.timeout(3_000).emitWithAck(event, payload) as Promise<T>;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const title = (
  tmdbId: number,
  name: string,
  popularity: number,
  link: string | null = null,
): ProviderTitle => ({
  tmdbId,
  title: name,
  releaseYear: 2000,
  popularity,
  posterUrl: null,
  genres: ['Drama'],
  link,
});

/** In-memory provider with call counting and switchable failure. */
export class StubProvider implements CatalogProvider {
  readonly id = 'stub';
  readonly attribution = 'stub';
  calls: string[] = [];
  fail = false;
  constructor(public catalogs: Record<string, ProviderCatalog | ProviderTitle[]>) {}
  async fetchCatalog(country: string, service: ServiceDefinition): Promise<ProviderCatalog> {
    this.calls.push(`${country}:${service.id}`);
    if (this.fail) throw new Error('upstream down');
    const c = this.catalogs[`${country}:${service.id}`] ?? [];
    return Array.isArray(c) ? { entries: c, truncated: false } : c;
  }
}
