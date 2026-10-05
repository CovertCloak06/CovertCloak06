/**
 * Real-time synchronisation engine (spec module 3) on Socket.io.
 *
 * Every handler follows the same pipeline:
 *   rate limit -> validate payload (zod) -> check room membership ->
 *   RoomService mutation -> relay / broadcast -> ack.
 *
 * Identity comes from the handshake token; payload `senderId`/`userId` fields
 * are never trusted. Relays of SYNC_ACTION and HOST_HEARTBEAT exclude the
 * sender (no server-side echo), and the client additionally ignores its own id.
 */
import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  ClientEvent,
  ErrorCode,
  ServerEvent,
  hostHeartbeatPayloadSchema,
  joinRoomPayloadSchema,
  leaveRoomPayloadSchema,
  memberStatusPayloadSchema,
  normalizeSubscription,
  InvalidSubscriptionError,
  scheduleStartPayloadSchema,
  selectTitlePayloadSchema,
  syncActionPayloadSchema,
  timePingPayloadSchema,
  transferHostPayloadSchema,
  updateSettingsPayloadSchema,
  type Ack,
  type ClientToServerEvents,
  type ProtocolError,
  type RelayedHeartbeat,
  type RelayedSyncAction,
  type RoomState,
  type ServerToClientEvents,
} from '@watch-party/shared';
import type { Redis } from 'ioredis';
import { Server, type Socket } from 'socket.io';
import type { z } from 'zod';
import type { SessionSigner } from '../auth/session.js';
import type { CatalogService } from '../catalog/catalog-service.js';
import type { Logger } from '../logger.js';
import { RoomError, type RoomService } from '../rooms/room-service.js';
import { LockTimeoutError } from '../store/types.js';
import { BUCKETS, RateLimiter, type BucketSpec } from './rate-limit.js';

interface SocketData {
  userId: string;
  roomId: string | null;
}

type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface SocketServerOptions {
  httpServer: HttpServer;
  rooms: RoomService;
  catalog: CatalogService;
  sessions: SessionSigner;
  logger: Logger;
  corsOrigins: '*' | string[];
  memberGraceMs: number;
  /** When set, broadcasts fan out across instances through Redis pub/sub. */
  redis?: { pub: Redis; sub: Redis };
}

const channel = (roomId: string) => `room:${roomId}`;

export function createSocketServer(opts: SocketServerOptions): {
  io: IoServer;
  close: () => Promise<void>;
} {
  const log = opts.logger.child({ component: 'realtime' });
  const io: IoServer = new Server(opts.httpServer, {
    cors: { origin: opts.corsOrigins === '*' ? '*' : opts.corsOrigins },
    // Small JSON messages only; reject anything big outright.
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    connectionStateRecovery: undefined,
  });
  if (opts.redis) io.adapter(createAdapter(opts.redis.pub, opts.redis.sub));

  const limiter = new RateLimiter();
  const graceTimers = new Map<string, NodeJS.Timeout>();
  /** Disconnect bookkeeping still running; close() waits for it before Redis goes away. */
  const pending = new Set<Promise<unknown>>();
  const track = <T>(p: Promise<T>): Promise<T> => {
    pending.add(p);
    void p.finally(() => pending.delete(p)).catch(() => undefined);
    return p;
  };

  io.use((socket, next) => {
    const session = opts.sessions.verify(socket.handshake.auth?.token);
    if (!session) return next(new Error(ErrorCode.UNAUTHORIZED));
    socket.data.userId = session.userId;
    socket.data.roomId = null;
    next();
  });

  const broadcastState = (state: RoomState) =>
    io.to(channel(state.roomId)).emit(ServerEvent.ROOM_STATE, state);

  io.on('connection', (socket: IoSocket) => {
    const userId = socket.data.userId;
    const slog = log.child({ userId, socketId: socket.id });
    slog.debug('connected');

    /** Wraps a handler with rate limiting, validation, error mapping and ack. */
    function handle<S extends z.ZodType, R>(
      bucket: BucketSpec,
      schema: S,
      fn: (payload: z.output<S>) => Promise<R>,
    ) {
      return async (raw: unknown, ack?: (a: Ack<R>) => void) => {
        const reply = typeof ack === 'function' ? ack : undefined;
        const fail = (error: ProtocolError) => {
          if (reply) reply({ ok: false, error });
          else socket.emit(ServerEvent.ROOM_ERROR, error);
        };
        if (!limiter.take(`${socket.id}:${bucketName(bucket)}`, bucket)) {
          return fail({ code: ErrorCode.RATE_LIMITED, message: 'Slow down' });
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          return fail({
            code: ErrorCode.BAD_REQUEST,
            message: parsed.error.issues[0]?.message ?? 'Invalid payload',
          });
        }
        try {
          const data = await fn(parsed.data);
          reply?.({ ok: true, data });
        } catch (err) {
          fail(toProtocolError(err, slog));
        }
      };
    }

    const requireRoom = (roomId: string) => {
      if (socket.data.roomId !== roomId)
        throw new RoomError(ErrorCode.NOT_IN_ROOM, 'Join the room first');
    };

    socket.on(ClientEvent.TIME_PING, (raw, ack) => {
      if (typeof ack !== 'function' || !limiter.take(`${socket.id}:ping`, BUCKETS.ping)) return;
      const parsed = timePingPayloadSchema.safeParse(raw);
      if (parsed.success) ack({ t0: parsed.data.t0, serverTime: Date.now() });
    });

    socket.on(
      ClientEvent.JOIN_ROOM,
      handle(BUCKETS.control, joinRoomPayloadSchema, async (p) => {
        if (p.userId && p.userId !== userId) {
          throw new RoomError(ErrorCode.FORBIDDEN, 'userId does not match your session');
        }
        let sub;
        try {
          sub = normalizeSubscription({ userId, countryCode: p.country, services: p.services });
        } catch (err) {
          if (err instanceof InvalidSubscriptionError)
            throw new RoomError(ErrorCode.BAD_REQUEST, err.message);
          throw err;
        }
        // One room per socket: leave the previous one first.
        if (socket.data.roomId && socket.data.roomId !== p.roomId) {
          await leaveCurrent(socket);
        }
        cancelGrace(p.roomId, userId);
        const state = await opts.rooms.join(p.roomId, {
          userId,
          displayName: p.displayName ?? 'Guest',
          countryCode: sub.countryCode,
          services: sub.services,
        });
        socket.data.roomId = p.roomId;
        await socket.join(channel(p.roomId));
        slog.info({ roomId: p.roomId, members: state.members.length }, 'joined room');
        // Late joiner after the title was chosen: work out where they can watch it.
        const withOptions =
          state.selection && !state.selection.watchOptions[userId]
            ? await opts.rooms
                .ensureSelectionOptions(p.roomId, userId, opts.catalog)
                .catch((err) => {
                  slog.warn({ err }, 'could not compute watch options for late joiner');
                  return null;
                })
            : null;
        const final = withOptions ?? state;
        socket.to(channel(p.roomId)).emit(ServerEvent.ROOM_STATE, final);
        return final;
      }),
    );

    socket.on(
      ClientEvent.LEAVE_ROOM,
      handle(BUCKETS.control, leaveRoomPayloadSchema, async (p) => {
        requireRoom(p.roomId);
        await leaveCurrent(socket);
        return null;
      }),
    );

    socket.on(
      ClientEvent.SYNC_ACTION,
      handle(BUCKETS.sync, syncActionPayloadSchema, async (p) => {
        requireRoom(p.roomId);
        const { timestamp } = await opts.rooms.applyAction(
          p.roomId,
          userId,
          p.action,
          p.timecode,
          p.timestamp,
        );
        const relayed: RelayedSyncAction = {
          roomId: p.roomId,
          senderId: userId,
          action: p.action,
          timecode: p.timecode,
          timestamp,
          serverTimestamp: Date.now(),
        };
        socket.to(channel(p.roomId)).emit(ServerEvent.SYNC_ACTION, relayed);
        return null;
      }),
    );

    socket.on(
      ClientEvent.HOST_HEARTBEAT,
      handle(BUCKETS.heartbeat, hostHeartbeatPayloadSchema, async (p) => {
        requireRoom(p.roomId);
        const { accepted, timestamp } = await opts.rooms.applyHeartbeat(p.roomId, userId, p);
        if (!accepted) return null; // only the host is a time source; silently ignore others
        const beat: RelayedHeartbeat = {
          roomId: p.roomId,
          senderId: userId,
          timecode: p.timecode,
          paused: p.paused,
          playbackRate: p.playbackRate,
          timestamp,
        };
        socket.to(channel(p.roomId)).emit(ServerEvent.SYNC_HEARTBEAT, beat);
        return null;
      }),
    );

    socket.on(
      ClientEvent.MEMBER_STATUS,
      handle(BUCKETS.status, memberStatusPayloadSchema, async (p) => {
        requireRoom(p.roomId);
        const { state, changed } = await opts.rooms.setMemberStatus(
          p.roomId,
          userId,
          p.status,
          p.timecode,
        );
        if (changed) broadcastState(state);
        return null;
      }),
    );

    socket.on(
      ClientEvent.SELECT_TITLE,
      handle(BUCKETS.control, selectTitlePayloadSchema, async (p) => {
        requireRoom(p.roomId);
        const state = await opts.rooms.selectTitle(p.roomId, userId, p.tmdbId, opts.catalog);
        broadcastState(state);
        return state.selection!;
      }),
    );

    socket.on(
      ClientEvent.SCHEDULE_START,
      handle(BUCKETS.control, scheduleStartPayloadSchema, async (p) => {
        requireRoom(p.roomId);
        const { state, start } = await opts.rooms.scheduleStart(
          p.roomId,
          userId,
          p.timecode,
          p.delayMs,
        );
        io.to(channel(p.roomId)).emit(ServerEvent.START_SCHEDULED, start);
        broadcastState(state);
        return start;
      }),
    );

    socket.on(
      ClientEvent.TRANSFER_HOST,
      handle(BUCKETS.control, transferHostPayloadSchema, async (p) => {
        requireRoom(p.roomId);
        broadcastState(await opts.rooms.transferHost(p.roomId, userId, p.userId));
        return null;
      }),
    );

    socket.on(
      ClientEvent.UPDATE_SETTINGS,
      handle(BUCKETS.control, updateSettingsPayloadSchema, async (p) => {
        requireRoom(p.roomId);
        broadcastState(
          await opts.rooms.updateSettings(p.roomId, userId, { hostOnlyControl: p.hostOnlyControl }),
        );
        return null;
      }),
    );

    socket.on('disconnect', (reason) => {
      limiter.clear(`${socket.id}:`);
      const roomId = socket.data.roomId;
      slog.debug({ reason, roomId }, 'disconnected');
      if (!roomId) return;
      void track(handleDisconnect(roomId, userId)).catch((err) =>
        slog.warn({ err }, 'disconnect handling failed'),
      );
    });
  });

  async function leaveCurrent(socket: IoSocket): Promise<void> {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.data.roomId = null;
    await socket.leave(channel(roomId));
    if (await userStillInRoom(roomId, socket.data.userId)) return;
    const state = await opts.rooms.leave(roomId, socket.data.userId);
    if (state) broadcastState(state);
  }

  /** True when another socket of the same user (another tab/device) is still in the room. */
  async function userStillInRoom(roomId: string, userId: string): Promise<boolean> {
    const sockets = await io.in(channel(roomId)).fetchSockets();
    return sockets.some((s) => s.data.userId === userId);
  }

  async function handleDisconnect(roomId: string, userId: string): Promise<void> {
    if (await userStillInRoom(roomId, userId)) return;
    const state = await opts.rooms.markDisconnected(roomId, userId);
    // A fast reconnect can rejoin between the check above and the write: the
    // "offline" flag would then be wrong. Re-check against live sockets.
    if (await userStillInRoom(roomId, userId)) {
      const repaired = await opts.rooms.markConnected(roomId, userId);
      if (repaired) broadcastState(repaired);
      return;
    }
    if (state) broadcastState(state);
    // Keep the seat (and host role) for a grace period: phones drop
    // connections when backgrounded or switching networks.
    const key = `${roomId}:${userId}`;
    cancelGrace(roomId, userId);
    graceTimers.set(
      key,
      setTimeout(() => {
        graceTimers.delete(key);
        void track(expireUnlessPresent(roomId, userId)).catch((err) =>
          log.warn({ err, roomId, userId }, 'grace expiry failed'),
        );
      }, opts.memberGraceMs),
    );
  }

  /** Grace period over: remove the member, unless a live socket says they're back. */
  async function expireUnlessPresent(roomId: string, userId: string): Promise<void> {
    if (await userStillInRoom(roomId, userId)) {
      const repaired = await opts.rooms.markConnected(roomId, userId);
      if (repaired) broadcastState(repaired);
      return;
    }
    const state = await opts.rooms.expireIfDisconnected(roomId, userId);
    if (state) broadcastState(state);
  }

  function cancelGrace(roomId: string, userId: string): void {
    const key = `${roomId}:${userId}`;
    const t = graceTimers.get(key);
    if (t) {
      clearTimeout(t);
      graceTimers.delete(key);
    }
  }

  return {
    io,
    close: async () => {
      for (const t of graceTimers.values()) clearTimeout(t);
      graceTimers.clear();
      // Stop accepting connections and disconnect clients; their disconnect
      // handlers record "offline" in the store, so let them finish.
      await io.close();
      await Promise.allSettled([...pending]);
    },
  };
}

function bucketName(spec: BucketSpec): string {
  for (const [name, s] of Object.entries(BUCKETS)) if (s === spec) return name;
  return 'other';
}

function toProtocolError(err: unknown, log: Logger): ProtocolError {
  if (err instanceof RoomError) return err.toProtocol();
  if (err instanceof LockTimeoutError)
    return { code: ErrorCode.INTERNAL, message: 'Room is busy, try again' };
  if (err instanceof Error && err.name === 'CatalogUnavailableError') {
    return { code: ErrorCode.CATALOG_UNAVAILABLE, message: err.message };
  }
  log.error({ err }, 'unhandled socket handler error');
  return { code: ErrorCode.INTERNAL, message: 'Something went wrong' };
}
