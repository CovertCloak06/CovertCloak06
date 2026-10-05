/**
 * Real-time protocol between watch room clients and the sync server.
 *
 * Transport is Socket.io. Each spec envelope `{ event, payload }` maps to a
 * Socket.io event named `event` carrying `payload`. Request-style events use
 * Socket.io acknowledgements and answer with an {@link Ack}.
 *
 * Identity is never taken from a payload: the server derives the user id from
 * the session token presented in the Socket.io handshake, and overwrites
 * `senderId` on everything it relays. That stops one member spoofing another
 * (or the host) by editing a JSON field.
 */
import { z } from 'zod';
import type { WatchOption } from './catalog.js';

export const PROTOCOL_VERSION = 1;
export const MAX_ROOM_MEMBERS = 8;
/** Longest timecode accepted (24h); guards against garbage values. */
export const MAX_TIMECODE_SECONDS = 24 * 60 * 60;

/** Unambiguous room-code alphabet: no I, O, 0 or 1. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const ClientEvent = {
  JOIN_ROOM: 'JOIN_ROOM',
  LEAVE_ROOM: 'LEAVE_ROOM',
  SYNC_ACTION: 'SYNC_ACTION',
  HOST_HEARTBEAT: 'HOST_HEARTBEAT',
  MEMBER_STATUS: 'MEMBER_STATUS',
  SELECT_TITLE: 'SELECT_TITLE',
  SCHEDULE_START: 'SCHEDULE_START',
  TRANSFER_HOST: 'TRANSFER_HOST',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  TIME_PING: 'TIME_PING',
} as const;

export const ServerEvent = {
  ROOM_STATE: 'ROOM_STATE',
  SYNC_ACTION: 'SYNC_ACTION',
  SYNC_HEARTBEAT: 'SYNC_HEARTBEAT',
  START_SCHEDULED: 'START_SCHEDULED',
  ROOM_ERROR: 'ROOM_ERROR',
} as const;

export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  CATALOG_UNAVAILABLE: 'CATALOG_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ProtocolError {
  code: ErrorCode;
  message: string;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: ProtocolError };

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

export const roomIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{4,32}$/, 'Invalid room id')
  .transform((s) => s.toUpperCase());

export const timecodeSchema = z.number().min(0).max(MAX_TIMECODE_SECONDS);
/** Epoch milliseconds expressed in the server's clock. */
export const timestampSchema = z.number().int().positive();
export const playbackRateSchema = z.number().min(0.25).max(4);
export const syncActionTypeSchema = z.enum(['PLAY', 'PAUSE', 'SEEK']);
export type SyncActionType = z.infer<typeof syncActionTypeSchema>;

/**
 * What a member's player is doing. `fallback` means the member is watching in
 * the native app (deep link) and syncing manually from the countdown.
 */
export const memberStatusSchema = z.enum([
  'idle',
  'loading',
  'ready',
  'playing',
  'paused',
  'buffering',
  'blocked',
  'fallback',
]);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

// ---------------------------------------------------------------------------
// Client -> server payloads
// ---------------------------------------------------------------------------

export const joinRoomPayloadSchema = z.object({
  roomId: roomIdSchema,
  /** Accepted for spec compatibility; must match the authenticated user if sent. */
  userId: z.string().optional(),
  /** Free-form country; normalised (UK -> GB) and validated server-side. */
  country: z.string().min(2).max(3),
  services: z.array(z.string().min(1).max(32)).min(1).max(20),
  displayName: z.string().trim().min(1).max(40).optional(),
});
export type JoinRoomPayload = z.input<typeof joinRoomPayloadSchema>;

export const leaveRoomPayloadSchema = z.object({ roomId: roomIdSchema });
export type LeaveRoomPayload = z.input<typeof leaveRoomPayloadSchema>;

export const syncActionPayloadSchema = z.object({
  roomId: roomIdSchema,
  /** Ignored: the server stamps the authenticated sender. */
  senderId: z.string().optional(),
  action: syncActionTypeSchema,
  timecode: timecodeSchema,
  /** When the action happened, in server-clock epoch ms (client clock + offset). */
  timestamp: timestampSchema,
});
export type SyncActionPayload = z.input<typeof syncActionPayloadSchema>;

export const hostHeartbeatPayloadSchema = z.object({
  roomId: roomIdSchema,
  timecode: timecodeSchema,
  paused: z.boolean(),
  playbackRate: playbackRateSchema.default(1),
  timestamp: timestampSchema,
});
export type HostHeartbeatPayload = z.input<typeof hostHeartbeatPayloadSchema>;

export const memberStatusPayloadSchema = z.object({
  roomId: roomIdSchema,
  status: memberStatusSchema,
  timecode: timecodeSchema.nullable().default(null),
});
export type MemberStatusPayload = z.input<typeof memberStatusPayloadSchema>;

export const selectTitlePayloadSchema = z.object({
  roomId: roomIdSchema,
  tmdbId: z.number().int().positive(),
});
export type SelectTitlePayload = z.input<typeof selectTitlePayloadSchema>;

export const scheduleStartPayloadSchema = z.object({
  roomId: roomIdSchema,
  /** Where everyone should be in the film when playback starts. */
  timecode: timecodeSchema,
  /** Countdown length. */
  delayMs: z.number().int().min(3_000).max(30_000).default(5_000),
});
export type ScheduleStartPayload = z.input<typeof scheduleStartPayloadSchema>;

export const transferHostPayloadSchema = z.object({
  roomId: roomIdSchema,
  userId: z.string().min(1),
});
export type TransferHostPayload = z.input<typeof transferHostPayloadSchema>;

export const updateSettingsPayloadSchema = z.object({
  roomId: roomIdSchema,
  hostOnlyControl: z.boolean(),
});
export type UpdateSettingsPayload = z.input<typeof updateSettingsPayloadSchema>;

export const timePingPayloadSchema = z.object({ t0: z.number() });
export type TimePingPayload = z.input<typeof timePingPayloadSchema>;
export interface TimePong {
  t0: number;
  serverTime: number;
}

// ---------------------------------------------------------------------------
// Server -> client payloads
// ---------------------------------------------------------------------------

export interface RoomMember {
  userId: string;
  displayName: string;
  countryCode: string;
  services: string[];
  joinedAt: number;
  /** False while the member is inside the reconnect grace period. */
  connected: boolean;
  status: MemberStatus;
  timecode: number | null;
  lastSeen: number;
}

/**
 * Last known authoritative playback state. `timecode` was accurate at
 * `timestamp` (server clock); while playing, the current position is
 * `timecode + (now - timestamp) / 1000 * playbackRate`.
 */
export interface PlaybackState {
  paused: boolean;
  timecode: number;
  timestamp: number;
  playbackRate: number;
  updatedBy: string | null;
}

export interface TitleSelection {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  runtimeMinutes: number | null;
  selectedBy: string;
  selectedAt: number;
  /** Per-user watch options; each client loads its own entry. */
  watchOptions: Record<string, WatchOption[]>;
}

export interface ScheduledStart {
  timecode: number;
  /** Server-clock epoch ms at which everyone presses play. */
  startAt: number;
  scheduledBy: string;
}

export interface RoomSettings {
  /** When true only the host may play, pause or seek. */
  hostOnlyControl: boolean;
}

export interface RoomState {
  roomId: string;
  hostId: string;
  createdAt: number;
  members: RoomMember[];
  playback: PlaybackState;
  selection: TitleSelection | null;
  scheduledStart: ScheduledStart | null;
  settings: RoomSettings;
  /** Server clock when this snapshot was sent. */
  serverTime: number;
}

export interface RelayedSyncAction {
  roomId: string;
  senderId: string;
  action: SyncActionType;
  timecode: number;
  timestamp: number;
  /** When the server received the action. */
  serverTimestamp: number;
}

export interface RelayedHeartbeat {
  roomId: string;
  senderId: string;
  timecode: number;
  paused: boolean;
  playbackRate: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Typed Socket.io event maps
// ---------------------------------------------------------------------------

export type AckCallback<T> = (ack: Ack<T>) => void;

export interface ClientToServerEvents {
  JOIN_ROOM: (payload: JoinRoomPayload, ack: AckCallback<RoomState>) => void;
  LEAVE_ROOM: (payload: LeaveRoomPayload, ack?: AckCallback<null>) => void;
  SYNC_ACTION: (payload: SyncActionPayload, ack?: AckCallback<null>) => void;
  HOST_HEARTBEAT: (payload: HostHeartbeatPayload) => void;
  MEMBER_STATUS: (payload: MemberStatusPayload) => void;
  SELECT_TITLE: (payload: SelectTitlePayload, ack: AckCallback<TitleSelection>) => void;
  SCHEDULE_START: (payload: ScheduleStartPayload, ack?: AckCallback<ScheduledStart>) => void;
  TRANSFER_HOST: (payload: TransferHostPayload, ack?: AckCallback<null>) => void;
  UPDATE_SETTINGS: (payload: UpdateSettingsPayload, ack?: AckCallback<null>) => void;
  TIME_PING: (payload: TimePingPayload, ack: (pong: TimePong) => void) => void;
}

export interface ServerToClientEvents {
  ROOM_STATE: (state: RoomState) => void;
  SYNC_ACTION: (action: RelayedSyncAction) => void;
  SYNC_HEARTBEAT: (beat: RelayedHeartbeat) => void;
  START_SCHEDULED: (start: ScheduledStart) => void;
  ROOM_ERROR: (error: ProtocolError) => void;
}

// ---------------------------------------------------------------------------
// HTTP API shapes
// ---------------------------------------------------------------------------

export interface SessionResponse {
  userId: string;
  token: string;
  expiresAt: number;
}

export interface CreateRoomResponse {
  roomId: string;
}

export interface CommonCatalogResponse<TTitle> {
  results: TTitle[];
  page: number;
  pageSize: number;
  totalResults: number;
  /**
   * True when at least one regional catalog was truncated by the configured
   * page budget, so the intersection may be missing titles.
   */
  partial: boolean;
  /** Which catalog provider produced the data (for attribution). */
  provider: string;
}
