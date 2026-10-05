/**
 * Room state and the rules that govern it.
 *
 * Rooms live in the store as one JSON document (`wp:v1:room:<code>`), always
 * modified under a per-room lock so two server instances can't interleave
 * updates. The service is transport-agnostic: the Socket.io layer calls it
 * and broadcasts whatever it returns.
 *
 * Rules:
 * - Host primacy: the host is the time source for drift correction. The host
 *   is always a member; when the host leaves (or never joined), the
 *   longest-standing connected member is promoted.
 * - Control: anyone may play/pause/seek unless the host enables host-only
 *   control. Choosing the title, scheduling a start, transferring host and
 *   changing settings are host-only.
 * - Scheduled starts are materialised lazily: once `startAt` passes, the
 *   stored state reads as "playing from timecode since startAt" with no timer.
 */
import { randomInt } from 'node:crypto';
import {
  ErrorCode,
  MAX_ROOM_MEMBERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  sanitizeTimestamp,
  type MemberStatus,
  type PlaybackState,
  type ProtocolError,
  type RoomMember,
  type RoomState,
  type ScheduledStart,
  type SyncActionType,
  type TitleSelection,
  type UserSubscription,
  type WatchOption,
} from '@watch-party/shared';
import type { Store } from '../store/types.js';

const NS = 'wp:v1';
/** Active rooms are kept for a day after their last update. */
const ROOM_TTL_MS = 24 * 3_600_000;
const LOCK_MS = 5_000;

type StoredRoom = Omit<RoomState, 'serverTime'> & { creatorId: string };

export class RoomError extends Error {
  constructor(
    readonly code: ProtocolError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
  toProtocol(): ProtocolError {
    return { code: this.code, message: this.message };
  }
}

export interface JoinInput {
  userId: string;
  displayName: string;
  countryCode: string;
  services: string[];
}

export interface TitleResolver {
  getTitle(
    tmdbId: number,
  ): Promise<{ title: string; posterUrl: string | null; runtimeMinutes: number | null } | null>;
  watchOptionsFor(
    tmdbId: number,
    users: UserSubscription[],
  ): Promise<Record<string, WatchOption[]>>;
}

export interface RoomServiceOptions {
  now?: () => number;
  /**
   * Disconnected members older than this are pruned on the next update. The
   * realtime layer's grace timer normally removes them sooner; this is the
   * safety net for timers lost when a server instance dies.
   */
  staleMemberMs?: number;
}

export class RoomService {
  private readonly now: () => number;
  private readonly staleMemberMs: number;

  constructor(
    private readonly store: Store,
    opts: RoomServiceOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.staleMemberMs = opts.staleMemberMs ?? 60_000;
  }

  private key(roomId: string): string {
    return `${NS}:room:${roomId}`;
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async get(roomId: string): Promise<RoomState | null> {
    const room = await this.store.getJSON<StoredRoom>(this.key(roomId));
    return room ? this.snapshot(room) : null;
  }

  snapshot(room: StoredRoom): RoomState {
    const { creatorId: _creator, ...state } = this.materialize(room);
    return { ...state, serverTime: this.now() };
  }

  private pruneStaleMembers(room: StoredRoom): void {
    const cutoff = this.now() - this.staleMemberMs;
    const before = room.members.length;
    room.members = room.members.filter((m) => m.connected || m.lastSeen > cutoff);
    if (room.members.length !== before && !room.members.some((m) => m.userId === room.hostId)) {
      promoteHost(room);
    }
  }

  /** Applies a scheduled start whose moment has passed. */
  private materialize(room: StoredRoom): StoredRoom {
    const s = room.scheduledStart;
    if (s && this.now() >= s.startAt) {
      return {
        ...room,
        playback: {
          paused: false,
          timecode: s.timecode,
          timestamp: s.startAt,
          playbackRate: 1,
          updatedBy: s.scheduledBy,
        },
        scheduledStart: null,
      };
    }
    return room;
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async create(creatorId: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const roomId = generateRoomCode();
      const room: StoredRoom = {
        roomId,
        creatorId,
        hostId: creatorId,
        createdAt: this.now(),
        members: [],
        playback: {
          paused: true,
          timecode: 0,
          timestamp: this.now(),
          playbackRate: 1,
          updatedBy: null,
        },
        selection: null,
        scheduledStart: null,
        settings: { hostOnlyControl: false },
      };
      if (await this.store.setJSONIfAbsent(this.key(roomId), room, ROOM_TTL_MS)) return roomId;
    }
    throw new RoomError(ErrorCode.INTERNAL, 'Could not allocate a room code');
  }

  /** Runs a mutation under the room lock and persists the result. */
  private async mutate<T>(
    roomId: string,
    fn: (room: StoredRoom) => T | Promise<T>,
  ): Promise<{ room: StoredRoom; result: T }> {
    return this.store.withLock(`${NS}:lock:room:${roomId}`, LOCK_MS, async () => {
      const stored = await this.store.getJSON<StoredRoom>(this.key(roomId));
      if (!stored) throw new RoomError(ErrorCode.ROOM_NOT_FOUND, 'Room not found');
      const room = this.materialize(stored);
      this.pruneStaleMembers(room);
      const result = await fn(room);
      await this.store.setJSON(this.key(roomId), room, ROOM_TTL_MS);
      return { room, result };
    });
  }

  async join(roomId: string, input: JoinInput): Promise<RoomState> {
    const { room } = await this.mutate(roomId, (room) => {
      const now = this.now();
      const existing = room.members.find((m) => m.userId === input.userId);
      if (existing) {
        Object.assign(existing, {
          displayName: input.displayName,
          countryCode: input.countryCode,
          services: input.services,
          connected: true,
          lastSeen: now,
        });
      } else {
        if (room.members.length >= MAX_ROOM_MEMBERS) {
          throw new RoomError(ErrorCode.ROOM_FULL, `Rooms hold at most ${MAX_ROOM_MEMBERS} people`);
        }
        room.members.push({
          userId: input.userId,
          displayName: input.displayName,
          countryCode: input.countryCode,
          services: input.services,
          joinedAt: now,
          connected: true,
          status: 'idle',
          timecode: null,
          lastSeen: now,
        });
      }
      // The host is always a member: if the current host isn't (the creator
      // hasn't joined yet, or everyone left), the joiner takes over.
      if (!room.members.some((m) => m.userId === room.hostId)) room.hostId = input.userId;
    });
    return this.snapshot(room);
  }

  /** Removes a member. Returns null when the room no longer exists. */
  async leave(roomId: string, userId: string): Promise<RoomState | null> {
    try {
      const { room } = await this.mutate(roomId, (room) => {
        room.members = room.members.filter((m) => m.userId !== userId);
        if (room.hostId === userId) promoteHost(room);
      });
      return this.snapshot(room);
    } catch (err) {
      if (err instanceof RoomError && err.code === ErrorCode.ROOM_NOT_FOUND) return null;
      throw err;
    }
  }

  /** Marks a member offline (reconnect grace period) without removing them. */
  async markDisconnected(roomId: string, userId: string): Promise<RoomState | null> {
    try {
      const { room } = await this.mutate(roomId, (room) => {
        const m = room.members.find((x) => x.userId === userId);
        if (m) {
          m.connected = false;
          m.lastSeen = this.now();
        }
      });
      return this.snapshot(room);
    } catch (err) {
      if (err instanceof RoomError && err.code === ErrorCode.ROOM_NOT_FOUND) return null;
      throw err;
    }
  }

  /**
   * Marks a member online again (repairs a stale "offline" flag left by a
   * disconnect handler that lost a race with a fast reconnect). Returns the
   * new state only when something changed.
   */
  async markConnected(roomId: string, userId: string): Promise<RoomState | null> {
    try {
      const { room, result } = await this.mutate(roomId, (room) => {
        const m = room.members.find((x) => x.userId === userId);
        if (!m || m.connected) return false;
        m.connected = true;
        m.lastSeen = this.now();
        return true;
      });
      return result ? this.snapshot(room) : null;
    } catch (err) {
      if (err instanceof RoomError && err.code === ErrorCode.ROOM_NOT_FOUND) return null;
      throw err;
    }
  }

  /** Removes the member only if still disconnected (they may have come back). */
  async expireIfDisconnected(roomId: string, userId: string): Promise<RoomState | null> {
    try {
      // Check and removal happen in one locked mutation, so a reconnect that
      // lands in between can't be undone by a removal decided on stale data.
      const { room, result } = await this.mutate(roomId, (room) => {
        const m = room.members.find((x) => x.userId === userId);
        if (!m || m.connected) return false;
        room.members = room.members.filter((x) => x.userId !== userId);
        if (room.hostId === userId) promoteHost(room);
        return true;
      });
      return result ? this.snapshot(room) : null;
    } catch (err) {
      if (err instanceof RoomError && err.code === ErrorCode.ROOM_NOT_FOUND) return null;
      throw err;
    }
  }

  async applyAction(
    roomId: string,
    userId: string,
    action: SyncActionType,
    timecode: number,
    clientTimestamp: number,
  ): Promise<{ state: RoomState; timestamp: number }> {
    const { room, result } = await this.mutate(roomId, (room) => {
      requireMember(room, userId);
      if (room.settings.hostOnlyControl && room.hostId !== userId) {
        throw new RoomError(ErrorCode.FORBIDDEN, 'Only the host can control playback in this room');
      }
      const timestamp = sanitizeTimestamp(clientTimestamp, this.now());
      const paused = action === 'PAUSE' ? true : action === 'PLAY' ? false : room.playback.paused;
      room.playback = {
        paused,
        timecode,
        timestamp,
        playbackRate: room.playback.playbackRate,
        updatedBy: userId,
      };
      // A manual action overrides any pending countdown.
      room.scheduledStart = null;
      return timestamp;
    });
    return { state: this.snapshot(room), timestamp: result };
  }

  /** Host heartbeat: refreshes the authoritative playhead. Non-hosts are ignored. */
  async applyHeartbeat(
    roomId: string,
    userId: string,
    beat: { timecode: number; paused: boolean; playbackRate: number; timestamp: number },
  ): Promise<{ accepted: boolean; timestamp: number }> {
    const { result } = await this.mutate(roomId, (room) => {
      if (room.hostId !== userId || room.scheduledStart) return null;
      const timestamp = sanitizeTimestamp(beat.timestamp, this.now());
      room.playback = {
        paused: beat.paused,
        timecode: beat.timecode,
        timestamp,
        playbackRate: beat.playbackRate,
        updatedBy: userId,
      };
      const m = room.members.find((x) => x.userId === userId);
      if (m) {
        m.timecode = beat.timecode;
        m.lastSeen = this.now();
      }
      return timestamp;
    });
    return result === null
      ? { accepted: false, timestamp: 0 }
      : { accepted: true, timestamp: result };
  }

  /** Updates a member's status. `changed` tells the caller whether to broadcast. */
  async setMemberStatus(
    roomId: string,
    userId: string,
    status: MemberStatus,
    timecode: number | null,
  ): Promise<{ state: RoomState; changed: boolean }> {
    const { room, result } = await this.mutate(roomId, (room) => {
      const m = requireMember(room, userId);
      const changed = m.status !== status || !m.connected;
      m.status = status;
      m.connected = true;
      m.lastSeen = this.now();
      if (timecode !== null) m.timecode = timecode;
      return changed;
    });
    return { state: this.snapshot(room), changed: result };
  }

  async selectTitle(
    roomId: string,
    userId: string,
    tmdbId: number,
    resolver: TitleResolver,
  ): Promise<RoomState> {
    // Resolve outside the lock: it may hit the catalog provider.
    const current = await this.store.getJSON<StoredRoom>(this.key(roomId));
    if (!current) throw new RoomError(ErrorCode.ROOM_NOT_FOUND, 'Room not found');
    requireHost(current, userId);
    const users = current.members.map((m) => ({
      userId: m.userId,
      countryCode: m.countryCode,
      services: m.services,
    }));
    const [title, watchOptions] = await Promise.all([
      resolver.getTitle(tmdbId),
      resolver.watchOptionsFor(tmdbId, users),
    ]);
    if (!title) throw new RoomError(ErrorCode.BAD_REQUEST, 'Unknown title');

    const { room } = await this.mutate(roomId, (room) => {
      requireHost(room, userId);
      const selection: TitleSelection = {
        tmdbId,
        title: title.title,
        posterUrl: title.posterUrl,
        runtimeMinutes: title.runtimeMinutes,
        selectedBy: userId,
        selectedAt: this.now(),
        watchOptions,
      };
      room.selection = selection;
      room.scheduledStart = null;
      room.playback = {
        paused: true,
        timecode: 0,
        timestamp: this.now(),
        playbackRate: 1,
        updatedBy: userId,
      };
      for (const m of room.members) m.status = m.connected ? 'loading' : m.status;
    });
    return this.snapshot(room);
  }

  /**
   * Computes watch options for a member who joined after the title was
   * chosen. Returns null when nothing needed updating.
   */
  async ensureSelectionOptions(
    roomId: string,
    userId: string,
    resolver: TitleResolver,
  ): Promise<RoomState | null> {
    const current = await this.store.getJSON<StoredRoom>(this.key(roomId));
    const member = current?.members.find((m) => m.userId === userId);
    const selection = current?.selection;
    if (!current || !member || !selection || selection.watchOptions[userId]) return null;
    const options = await resolver.watchOptionsFor(selection.tmdbId, [
      { userId, countryCode: member.countryCode, services: member.services },
    ]);
    const { room } = await this.mutate(roomId, (room) => {
      if (room.selection?.tmdbId === selection.tmdbId) {
        room.selection.watchOptions[userId] = options[userId] ?? [];
      }
    });
    return this.snapshot(room);
  }

  async scheduleStart(
    roomId: string,
    userId: string,
    timecode: number,
    delayMs: number,
  ): Promise<{ state: RoomState; start: ScheduledStart }> {
    const { room, result } = await this.mutate(roomId, (room) => {
      requireHost(room, userId);
      const start: ScheduledStart = {
        timecode,
        startAt: this.now() + delayMs,
        scheduledBy: userId,
      };
      room.scheduledStart = start;
      room.playback = {
        paused: true,
        timecode,
        timestamp: this.now(),
        playbackRate: 1,
        updatedBy: userId,
      };
      return start;
    });
    return { state: this.snapshot(room), start: result };
  }

  async transferHost(roomId: string, userId: string, toUserId: string): Promise<RoomState> {
    const { room } = await this.mutate(roomId, (room) => {
      requireHost(room, userId);
      const target = room.members.find((m) => m.userId === toUserId);
      if (!target) throw new RoomError(ErrorCode.BAD_REQUEST, 'That person is not in the room');
      room.hostId = toUserId;
    });
    return this.snapshot(room);
  }

  async updateSettings(
    roomId: string,
    userId: string,
    settings: { hostOnlyControl: boolean },
  ): Promise<RoomState> {
    const { room } = await this.mutate(roomId, (room) => {
      requireHost(room, userId);
      room.settings = { ...room.settings, ...settings };
    });
    return this.snapshot(room);
  }
}

function requireMember(room: StoredRoom, userId: string): RoomMember {
  const m = room.members.find((x) => x.userId === userId);
  if (!m) throw new RoomError(ErrorCode.NOT_IN_ROOM, 'Join the room first');
  return m;
}

function requireHost(room: StoredRoom, userId: string): void {
  requireMember(room, userId);
  if (room.hostId !== userId) throw new RoomError(ErrorCode.FORBIDDEN, 'Only the host can do that');
}

/** Host goes to the longest-standing connected member, else any member. */
function promoteHost(room: StoredRoom): void {
  const byTenure = [...room.members].sort((a, b) => a.joinedAt - b.joinedAt);
  const next = byTenure.find((m) => m.connected) ?? byTenure[0];
  if (next) room.hostId = next.userId;
}

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++)
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

export type { PlaybackState };
