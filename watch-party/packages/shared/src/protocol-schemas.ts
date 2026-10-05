/**
 * Runtime validation (zod) for every client -> server payload in protocol.ts.
 * Used by the server; clients only need the types.
 */
import { z } from 'zod';
import {
  MAX_TIMECODE_SECONDS,
  MEMBER_STATUSES,
  type HostHeartbeatPayload,
  type JoinRoomPayload,
  type LeaveRoomPayload,
  type MemberStatus,
  type MemberStatusPayload,
  type ScheduleStartPayload,
  type SelectTitlePayload,
  type SyncActionPayload,
  type SyncActionType,
  type TimePingPayload,
  type TransferHostPayload,
  type UpdateSettingsPayload,
} from './protocol.js';

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

/**
 * What a member's player is doing. `fallback` means the member is watching in
 * the native app (deep link) and syncing manually from the countdown.
 */
export const memberStatusSchema = z.enum(MEMBER_STATUSES as [MemberStatus, ...MemberStatus[]]);

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

export const leaveRoomPayloadSchema = z.object({ roomId: roomIdSchema });

export const syncActionPayloadSchema = z.object({
  roomId: roomIdSchema,
  /** Ignored: the server stamps the authenticated sender. */
  senderId: z.string().optional(),
  action: syncActionTypeSchema,
  timecode: timecodeSchema,
  /** When the action happened, in server-clock epoch ms (client clock + offset). */
  timestamp: timestampSchema,
});

export const hostHeartbeatPayloadSchema = z.object({
  roomId: roomIdSchema,
  timecode: timecodeSchema,
  paused: z.boolean(),
  playbackRate: playbackRateSchema.default(1),
  timestamp: timestampSchema,
});

export const memberStatusPayloadSchema = z.object({
  roomId: roomIdSchema,
  status: memberStatusSchema,
  timecode: timecodeSchema.nullable().default(null),
});

export const selectTitlePayloadSchema = z.object({
  roomId: roomIdSchema,
  tmdbId: z.number().int().positive(),
});

export const scheduleStartPayloadSchema = z.object({
  roomId: roomIdSchema,
  /** Where everyone should be in the film when playback starts. */
  timecode: timecodeSchema,
  /** Countdown length. */
  delayMs: z.number().int().min(3_000).max(30_000).default(5_000),
});

export const transferHostPayloadSchema = z.object({
  roomId: roomIdSchema,
  userId: z.string().min(1),
});

export const updateSettingsPayloadSchema = z.object({
  roomId: roomIdSchema,
  hostOnlyControl: z.boolean(),
});

export const timePingPayloadSchema = z.object({ t0: z.number() });

// ---------------------------------------------------------------------------
// Compile-time guarantee that schemas and the hand-written interfaces agree.
// ---------------------------------------------------------------------------

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

export type _ProtocolSchemaChecks = [
  Assert<Equals<z.infer<typeof syncActionTypeSchema>, SyncActionType>>,
  Assert<Equals<z.infer<typeof memberStatusSchema>, MemberStatus>>,
  Assert<Equals<z.input<typeof joinRoomPayloadSchema>, JoinRoomPayload>>,
  Assert<Equals<z.input<typeof leaveRoomPayloadSchema>, LeaveRoomPayload>>,
  Assert<Equals<z.input<typeof syncActionPayloadSchema>, SyncActionPayload>>,
  Assert<Equals<z.input<typeof hostHeartbeatPayloadSchema>, HostHeartbeatPayload>>,
  Assert<Equals<z.input<typeof memberStatusPayloadSchema>, MemberStatusPayload>>,
  Assert<Equals<z.input<typeof selectTitlePayloadSchema>, SelectTitlePayload>>,
  Assert<Equals<z.input<typeof scheduleStartPayloadSchema>, ScheduleStartPayload>>,
  Assert<Equals<z.input<typeof transferHostPayloadSchema>, TransferHostPayload>>,
  Assert<Equals<z.input<typeof updateSettingsPayloadSchema>, UpdateSettingsPayload>>,
  Assert<Equals<z.input<typeof timePingPayloadSchema>, TimePingPayload>>,
];
