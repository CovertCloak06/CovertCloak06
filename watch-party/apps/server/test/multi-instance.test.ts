/**
 * Two server instances behind a load balancer share Redis: room state lives
 * in Redis and broadcasts fan out through the Socket.io Redis adapter, so
 * members connected to different instances still sync.
 */
import type { Ack, RelayedSyncAction, RoomState } from '@watch-party/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixtureCatalogProvider } from '../src/catalog/providers/fixture.js';
import { RedisStore } from '../src/store/redis.js';
import {
  connectSocket,
  createRoom,
  emitAck,
  newSession,
  nextEvent,
  startApp,
  type RunningApp,
} from './helpers.js';

const REDIS_URL = process.env.TEST_REDIS_URL;

describe.skipIf(!REDIS_URL)('multiple instances sharing Redis', () => {
  let one: RunningApp;
  let two: RunningApp;

  beforeAll(async () => {
    const env = { REDIS_URL: REDIS_URL! };
    one = await startApp(
      {
        store: RedisStore.connect(REDIS_URL!),
        provider: new FixtureCatalogProvider(),
        metadata: null,
      },
      env,
    );
    two = await startApp(
      {
        store: RedisStore.connect(REDIS_URL!),
        provider: new FixtureCatalogProvider(),
        metadata: null,
      },
      env,
    );
  });
  afterAll(async () => {
    await one?.close();
    await two?.close();
  });

  it('relays sync actions and room state between members on different instances', async () => {
    const ana = await newSession(one.url);
    const ben = await newSession(two.url); // same secret: sessions work on either instance
    const roomId = await createRoom(one.url, ana.token);
    const sa = await connectSocket(one.url, ana.token);
    const sb = await connectSocket(two.url, ben.token);
    try {
      await emitAck<Ack<RoomState>>(sa, 'JOIN_ROOM', {
        roomId,
        country: 'US',
        services: ['netflix'],
      });
      const seen = nextEvent<RoomState>(sa, 'ROOM_STATE', 5_000, (s) => s.members.length === 2);
      const joined = await emitAck<Ack<RoomState>>(sb, 'JOIN_ROOM', {
        roomId,
        country: 'GB',
        services: ['netflix'],
      });
      expect(joined.ok).toBe(true);
      expect((await seen).members.map((m) => m.userId).sort()).toEqual(
        [ana.userId, ben.userId].sort(),
      );

      const relayed = nextEvent<RelayedSyncAction>(sb, 'SYNC_ACTION', 5_000);
      await emitAck(sa, 'SYNC_ACTION', {
        roomId,
        action: 'PAUSE',
        timecode: 77,
        timestamp: Date.now(),
      });
      expect(await relayed).toMatchObject({ senderId: ana.userId, action: 'PAUSE', timecode: 77 });
    } finally {
      sa.disconnect();
      sb.disconnect();
    }
  });
});
