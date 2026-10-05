/**
 * Client-side orchestration of a watch room, independent of platform.
 *
 * Sits between the Socket.io connection and the injected player controller:
 *
 *   player controller  <-- PlayerCommand ---  RoomSyncClient  <-- server events
 *          |                                     ^    |
 *          '------------- PlayerEvent -----------'    '--> SYNC_ACTION / HEARTBEAT
 *
 * Responsibilities: joining and re-joining after reconnects, estimating the
 * clock offset to the server, translating local player actions into protocol
 * messages, applying remote actions, driving host heartbeats (host primacy),
 * reporting member status, and late-joiner catch-up.
 */
import {
  ClientEvent,
  ErrorCode,
  ServerEvent,
  type Ack,
  type ProtocolError,
  type RelayedHeartbeat,
  type RelayedSyncAction,
  type RoomState,
  type ScheduledStart,
  type MemberStatus,
  type TimePong,
  type TitleSelection,
} from '../protocol.js';
import type { PlayerCommand, PlayerEvent } from '../player/messages.js';
import { ClockSync, projectTimecode, SYNC_RULES } from '../sync.js';
import { Emitter } from './emitter.js';

/** The subset of a Socket.io client socket this class needs. */
export interface SocketLike {
  readonly connected: boolean;
  emit(event: string, ...args: any[]): unknown;
  on(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
}

/** Where commands for the local player go (WebView bridge, content script port...). */
export interface PlayerPort {
  send(command: PlayerCommand): void;
}

export interface RoomProfile {
  country: string;
  services: string[];
  displayName: string;
}

export interface RoomSyncClientOptions {
  socket: SocketLike;
  roomId: string;
  userId: string;
  profile: RoomProfile;
  now?: () => number;
  ackTimeoutMs?: number;
  /** Interval for background clock re-sync. */
  clockResyncMs?: number;
}

export interface ScheduledStartLocal extends ScheduledStart {
  /** `startAt` converted to this device's clock. */
  startAtLocal: number;
}

export interface RoomClientEvents {
  state: RoomState;
  /** A remote action was applied (for toasts like "Ana paused"). */
  remoteAction: RelayedSyncAction;
  scheduled: ScheduledStartLocal;
  error: ProtocolError;
  autoplayBlocked: { message: string };
  /** Seconds this device is ahead (+) or behind (-) the host; null when unknown. */
  drift: number | null;
  connection: 'connected' | 'disconnected';
}

export class RoomRequestError extends Error {
  constructor(
    readonly code: ProtocolError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'RoomRequestError';
  }
}

const PAUSED_HEARTBEAT_MS = 6_000;
const STATUS_REFRESH_MS = 5_000;

export class RoomSyncClient extends Emitter<RoomClientEvents> {
  readonly clock = new ClockSync();
  readonly roomId: string;
  readonly userId: string;

  private readonly socket: SocketLike;
  private readonly profile: RoomProfile;
  private readonly now: () => number;
  private readonly ackTimeoutMs: number;
  private readonly clockResyncMs: number;

  private roomState: RoomState | null = null;
  private player: PlayerPort | null = null;
  private lastStatus: Extract<PlayerEvent, { type: 'PLAYER_STATUS' }> | null = null;
  private lastHeartbeatAt = 0;
  private lastMemberStatus: { status: MemberStatus; at: number } | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private joined = false;
  private disposed = false;

  constructor(options: RoomSyncClientOptions) {
    super();
    this.socket = options.socket;
    this.roomId = options.roomId.toUpperCase();
    this.userId = options.userId;
    this.profile = options.profile;
    this.now = options.now ?? (() => Date.now());
    this.ackTimeoutMs = options.ackTimeoutMs ?? 8_000;
    this.clockResyncMs = options.clockResyncMs ?? 15_000;

    this.socket.on(ServerEvent.ROOM_STATE, this.onRoomState);
    this.socket.on(ServerEvent.SYNC_ACTION, this.onSyncAction);
    this.socket.on(ServerEvent.SYNC_HEARTBEAT, this.onHeartbeat);
    this.socket.on(ServerEvent.START_SCHEDULED, this.onStartScheduled);
    this.socket.on(ServerEvent.ROOM_ERROR, this.onRoomError);
    this.socket.on('connect', this.onConnect);
    this.socket.on('disconnect', this.onDisconnect);
  }

  get state(): RoomState | null {
    return this.roomState;
  }

  get isHost(): boolean {
    return this.roomState?.hostId === this.userId;
  }

  /** May this user play/pause/seek right now? */
  get canControl(): boolean {
    return !!this.roomState && (!this.roomState.settings.hostOnlyControl || this.isHost);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async join(): Promise<RoomState> {
    await this.syncClock(6);
    const state = await this.request<RoomState>(ClientEvent.JOIN_ROOM, {
      roomId: this.roomId,
      userId: this.userId,
      country: this.profile.country,
      services: this.profile.services,
      displayName: this.profile.displayName,
    });
    this.joined = true;
    this.applyState(state);
    if (!this.clockTimer) {
      this.clockTimer = setInterval(() => void this.syncClock(1), this.clockResyncMs);
    }
    return state;
  }

  leave(): void {
    if (this.joined && this.socket.connected) {
      this.socket.emit(ClientEvent.LEAVE_ROOM, { roomId: this.roomId });
    }
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.joined = false;
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.startTimer) clearTimeout(this.startTimer);
    this.clockTimer = this.startTimer = null;
    this.socket.off(ServerEvent.ROOM_STATE, this.onRoomState);
    this.socket.off(ServerEvent.SYNC_ACTION, this.onSyncAction);
    this.socket.off(ServerEvent.SYNC_HEARTBEAT, this.onHeartbeat);
    this.socket.off(ServerEvent.START_SCHEDULED, this.onStartScheduled);
    this.socket.off(ServerEvent.ROOM_ERROR, this.onRoomError);
    this.socket.off('connect', this.onConnect);
    this.socket.off('disconnect', this.onDisconnect);
    this.player = null;
    this.removeAllListeners();
  }

  attachPlayer(port: PlayerPort): void {
    this.player = port;
    port.send({ type: 'REQUEST_STATUS' });
  }

  detachPlayer(): void {
    this.player = null;
    this.lastStatus = null;
    this.emit('drift', null);
  }

  // ---------------------------------------------------------------------------
  // Room commands
  // ---------------------------------------------------------------------------

  selectTitle(tmdbId: number): Promise<TitleSelection> {
    return this.request(ClientEvent.SELECT_TITLE, { roomId: this.roomId, tmdbId });
  }

  scheduleStart(timecode: number, delayMs = 5_000): Promise<ScheduledStart> {
    return this.request(ClientEvent.SCHEDULE_START, { roomId: this.roomId, timecode, delayMs });
  }

  transferHost(userId: string): Promise<null> {
    return this.request(ClientEvent.TRANSFER_HOST, { roomId: this.roomId, userId });
  }

  setHostOnlyControl(hostOnlyControl: boolean): Promise<null> {
    return this.request(ClientEvent.UPDATE_SETTINGS, { roomId: this.roomId, hostOnlyControl });
  }

  /**
   * Reports status for members without an injected player (native-app
   * fallback) or for explicit states such as "loading".
   */
  reportStatus(status: MemberStatus, timecode: number | null = null): void {
    this.lastMemberStatus = { status, at: this.now() };
    if (this.joined) {
      this.socket.emit(ClientEvent.MEMBER_STATUS, { roomId: this.roomId, status, timecode });
    }
  }

  /** Current room playhead (seconds) projected to now, from the authoritative state. */
  roomTimecode(): number | null {
    const s = this.roomState;
    if (!s) return null;
    return projectTimecode(s.playback, this.clock.serverNow(this.now()));
  }

  // ---------------------------------------------------------------------------
  // Player -> room
  // ---------------------------------------------------------------------------

  handlePlayerEvent(event: PlayerEvent): void {
    if (!this.joined || this.disposed) return;
    switch (event.type) {
      case 'PLAYER_EVENT':
        this.onLocalAction(event);
        return;
      case 'PLAYER_STATUS':
        this.onLocalStatus(event);
        return;
      case 'PLAYER_ATTACHED':
        this.updateMemberStatus('ready', null, true);
        this.catchUp();
        return;
      case 'PLAYER_DETACHED':
        this.lastStatus = null;
        this.updateMemberStatus('loading', null, true);
        return;
      case 'PLAYER_ERROR':
        if (event.code === 'AUTOPLAY_BLOCKED') {
          this.updateMemberStatus('blocked', null, true);
          this.emit('autoplayBlocked', { message: event.message });
        }
        return;
    }
  }

  private onLocalAction(event: Extract<PlayerEvent, { type: 'PLAYER_EVENT' }>): void {
    const state = this.roomState;
    if (!state) return;
    if (!this.canControl) {
      // Host-only rooms: snap this player back to the room instead of broadcasting.
      this.catchUp();
      this.emit('error', {
        code: ErrorCode.FORBIDDEN,
        message: 'Only the host can control playback in this room',
      });
      return;
    }
    const timestamp = Math.round(this.clock.serverNow(event.at));
    this.socket.emit(ClientEvent.SYNC_ACTION, {
      roomId: this.roomId,
      senderId: this.userId,
      action: event.action,
      timecode: event.timecode,
      timestamp,
    });
    // Optimistic local update so heartbeats and catch-up use the new state at once.
    state.playback = {
      paused:
        event.action === 'PAUSE' ? true : event.action === 'PLAY' ? false : state.playback.paused,
      timecode: event.timecode,
      timestamp,
      playbackRate: state.playback.playbackRate,
      updatedBy: this.userId,
    };
  }

  private onLocalStatus(status: Extract<PlayerEvent, { type: 'PLAYER_STATUS' }>): void {
    this.lastStatus = status;
    const memberStatus: MemberStatus = status.buffering
      ? 'buffering'
      : status.paused
        ? 'paused'
        : 'playing';
    this.updateMemberStatus(memberStatus, status.timecode, false);

    if (this.isHost) {
      const interval = status.paused ? PAUSED_HEARTBEAT_MS : SYNC_RULES.heartbeatIntervalMs;
      const now = this.now();
      if (now - this.lastHeartbeatAt >= interval) {
        this.lastHeartbeatAt = now;
        this.socket.emit(ClientEvent.HOST_HEARTBEAT, {
          roomId: this.roomId,
          timecode: status.timecode,
          paused: status.paused,
          playbackRate: status.playbackRate,
          timestamp: Math.round(this.clock.serverNow(status.at)),
        });
      }
    }
  }

  private updateMemberStatus(status: MemberStatus, timecode: number | null, force: boolean): void {
    const now = this.now();
    const last = this.lastMemberStatus;
    if (!force && last && last.status === status && now - last.at < STATUS_REFRESH_MS) return;
    this.reportStatus(status, timecode);
  }

  /** Bring the local player to the room's authoritative position. */
  private catchUp(): void {
    const s = this.roomState;
    if (!s || !this.player) return;
    this.player.send({
      type: 'SYNC',
      timecode: s.playback.timecode,
      asOf: this.clock.toLocal(s.playback.timestamp),
      paused: s.playback.paused,
      playbackRate: s.playback.playbackRate,
    });
  }

  // ---------------------------------------------------------------------------
  // Room -> player
  // ---------------------------------------------------------------------------

  private readonly onRoomState = (state: RoomState): void => {
    if (state.roomId !== this.roomId) return;
    this.applyState(state);
  };

  private applyState(state: RoomState): void {
    const wasHost = this.isHost;
    this.roomState = state;
    if (!wasHost && this.isHost) this.lastHeartbeatAt = 0; // start heartbeating immediately
    this.emit('state', state);
  }

  private readonly onSyncAction = (action: RelayedSyncAction): void => {
    if (action.roomId !== this.roomId || action.senderId === this.userId) return;
    if (this.roomState) {
      this.roomState.playback = {
        paused:
          action.action === 'PAUSE'
            ? true
            : action.action === 'PLAY'
              ? false
              : this.roomState.playback.paused,
        timecode: action.timecode,
        timestamp: action.timestamp,
        playbackRate: this.roomState.playback.playbackRate,
        updatedBy: action.senderId,
      };
    }
    this.player?.send({
      type: 'APPLY',
      action: action.action,
      timecode: action.timecode,
      asOf: this.clock.toLocal(action.timestamp),
    });
    this.emit('remoteAction', action);
  };

  private readonly onHeartbeat = (beat: RelayedHeartbeat): void => {
    const s = this.roomState;
    if (!s || beat.roomId !== this.roomId || beat.senderId === this.userId) return;
    if (beat.senderId !== s.hostId) return; // host primacy: only the host is the time source
    s.playback = {
      paused: beat.paused,
      timecode: beat.timecode,
      timestamp: beat.timestamp,
      playbackRate: beat.playbackRate,
      updatedBy: beat.senderId,
    };
    const asOf = this.clock.toLocal(beat.timestamp);
    this.player?.send({
      type: 'SYNC',
      timecode: beat.timecode,
      asOf,
      paused: beat.paused,
      playbackRate: beat.playbackRate,
    });
    const status = this.lastStatus;
    if (status) {
      const hostNow = projectTimecode({ ...s.playback, timestamp: asOf }, status.at);
      this.emit('drift', status.timecode - hostNow);
    }
  };

  private readonly onStartScheduled = (start: ScheduledStart): void => {
    const startAtLocal = this.clock.toLocal(start.startAt);
    this.emit('scheduled', { ...start, startAtLocal });
    if (!this.player) return; // native fallback: the UI runs the countdown
    const player = this.player;
    // Park everyone on the same frame, then press play together.
    player.send({ type: 'APPLY', action: 'PAUSE', timecode: start.timecode, asOf: this.now() });
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = setTimeout(
      () => {
        this.startTimer = null;
        if (this.player === player) {
          player.send({
            type: 'APPLY',
            action: 'PLAY',
            timecode: start.timecode,
            asOf: startAtLocal,
          });
        }
      },
      Math.max(0, startAtLocal - this.now()),
    );
  };

  private readonly onRoomError = (error: ProtocolError): void => {
    this.emit('error', error);
  };

  private readonly onConnect = (): void => {
    this.emit('connection', 'connected');
    if (!this.joined || this.disposed) return;
    // Socket.io gives a new socket id after a reconnect: rejoin to restore membership.
    this.clock.reset();
    this.join()
      .then(() => this.catchUp())
      .catch((err: unknown) =>
        this.emit('error', {
          code: err instanceof RoomRequestError ? err.code : ErrorCode.INTERNAL,
          message: err instanceof Error ? err.message : 'Failed to rejoin room',
        }),
      );
  };

  private readonly onDisconnect = (): void => {
    this.emit('connection', 'disconnected');
  };

  // ---------------------------------------------------------------------------
  // Transport helpers
  // ---------------------------------------------------------------------------

  /** Takes `samples` clock measurements, spaced out to dodge transient jitter. */
  async syncClock(samples: number): Promise<void> {
    for (let i = 0; i < samples; i++) {
      if (!this.socket.connected) return;
      const t0 = this.now();
      const pong = await this.rawRequest<TimePong>(ClientEvent.TIME_PING, { t0 }).catch(() => null);
      if (pong && pong.t0 === t0) this.clock.addSample(t0, pong.serverTime, this.now());
      if (i < samples - 1) await delay(120);
    }
  }

  private async request<T>(event: string, payload: unknown): Promise<T> {
    const ack = await this.rawRequest<Ack<T>>(event, payload);
    if (!ack.ok) throw new RoomRequestError(ack.error.code, ack.error.message);
    return ack.data;
  }

  private rawRequest<T>(event: string, payload: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new RoomRequestError(ErrorCode.INTERNAL, `${event} timed out`));
      }, this.ackTimeoutMs);
      this.socket.emit(event, payload, (response: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      });
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
