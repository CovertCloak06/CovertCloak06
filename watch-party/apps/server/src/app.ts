/**
 * Composition root: wires config, store, catalog provider, rooms, HTTP and
 * Socket.io together. Tests call {@link createApp} with overrides (memory
 * store, stub provider) and an ephemeral port.
 */
import { createServer, type Server as HttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { SessionSigner } from './auth/session.js';
import { CatalogService } from './catalog/catalog-service.js';
import { FixtureCatalogProvider } from './catalog/providers/fixture.js';
import { StreamingAvailabilityProvider } from './catalog/providers/streaming-availability.js';
import { TmdbClient } from './catalog/providers/tmdb.js';
import type { CatalogProvider, MetadataProvider } from './catalog/providers/types.js';
import type { AppConfig } from './config.js';
import { createApiRouter } from './http/routes.js';
import type { Logger } from './logger.js';
import { createSocketServer } from './realtime/socket-server.js';
import { RoomService } from './rooms/room-service.js';
import { MemoryStore } from './store/memory.js';
import { RedisStore } from './store/redis.js';
import type { Store } from './store/types.js';

export interface AppOverrides {
  store?: Store;
  provider?: CatalogProvider;
  metadata?: MetadataProvider | null;
}

export interface App {
  httpServer: HttpServer;
  store: Store;
  catalog: CatalogService;
  rooms: RoomService;
  sessions: SessionSigner;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export function buildProviders(config: AppConfig): { provider: CatalogProvider; metadata: MetadataProvider | null } {
  const tmdb = config.catalog.tmdb
    ? new TmdbClient({ ...config.catalog.tmdb, maxPages: config.catalog.maxPages })
    : null;
  let provider: CatalogProvider;
  switch (config.catalog.provider) {
    case 'streaming-availability':
      provider = new StreamingAvailabilityProvider({
        ...config.catalog.streamingAvailability!,
        maxPages: config.catalog.maxPages,
      });
      break;
    case 'tmdb':
      provider = tmdb!;
      break;
    default:
      provider = new FixtureCatalogProvider();
  }
  return { provider, metadata: tmdb };
}

export function createApp(config: AppConfig, logger: Logger, overrides: AppOverrides = {}): App {
  const store: Store =
    overrides.store ?? (config.redisUrl ? RedisStore.connect(config.redisUrl) : new MemoryStore());
  const built = overrides.provider ? null : buildProviders(config);
  const provider = overrides.provider ?? built!.provider;
  const metadata = overrides.metadata !== undefined ? overrides.metadata : (built?.metadata ?? null);

  const catalog = new CatalogService({
    store,
    provider,
    ...(metadata ? { metadata } : {}),
    ttlMs: config.catalog.ttlMs,
    logger,
  });
  // Stale offline members are pruned well after the normal grace period.
  const rooms = new RoomService(store, { staleMemberMs: config.memberGraceMs * 3 + 30_000 });
  const sessions = new SessionSigner(config.sessionSecret, config.sessionTtlMs);

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          mediaSrc: ["'self'", 'blob:'],
          imgSrc: ["'self'", 'data:', 'https://image.tmdb.org'],
        },
      },
    }),
  );
  app.use(cors({ origin: config.corsOrigins === '*' ? '*' : config.corsOrigins }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/readyz', async (_req, res) => {
    const storeOk = await store.ping();
    res.status(storeOk ? 200 : 503).json({ ok: storeOk, store: store.kind, provider: provider.id });
  });
  app.use('/api', createApiRouter({ sessions, catalog, rooms, store, logger }));

  if (config.devHarness) {
    const dir = fileURLToPath(new URL('../public/dev', import.meta.url));
    app.use('/dev', express.static(dir, { index: 'index.html', fallthrough: true }));
  }
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  const httpServer = createServer(app);

  let redisPubSub: { pub: import('ioredis').Redis; sub: import('ioredis').Redis } | undefined;
  if (store instanceof RedisStore) {
    redisPubSub = { pub: store.client.duplicate(), sub: store.client.duplicate() };
    // ioredis emits 'error' on connection problems; without a listener Node
    // would crash the process. It reconnects on its own, so log and carry on.
    const redisLog = logger.child({ component: 'redis' });
    for (const [role, client] of [['store', store.client], ['pub', redisPubSub.pub], ['sub', redisPubSub.sub]] as const) {
      client.on('error', (err: Error) => redisLog.warn({ err: err.message, role }, 'redis connection error'));
    }
  }
  const realtime = createSocketServer({
    httpServer,
    rooms,
    catalog,
    sessions,
    logger,
    corsOrigins: config.corsOrigins,
    memberGraceMs: config.memberGraceMs,
    ...(redisPubSub ? { redis: redisPubSub } : {}),
  });

  return {
    httpServer,
    store,
    catalog,
    rooms,
    sessions,
    listen(port = config.port, host = config.host) {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          const addr = httpServer.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      });
    },
    async close() {
      await realtime.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
        httpServer.closeAllConnections?.();
      });
      if (redisPubSub) {
        // The Redis adapter's close() queues (P)UNSUBSCRIBEs without awaiting
        // them. Redis answers a connection's commands in order, so a PING
        // round trip proves they finished before the connections are closed.
        const clients = [redisPubSub.pub, redisPubSub.sub];
        await Promise.allSettled(clients.map((c) => c.ping()));
        await Promise.allSettled(clients.map((c) => c.quit()));
      }
      await store.close();
    },
  };
}
