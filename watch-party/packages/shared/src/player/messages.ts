/**
 * Messages exchanged between the host app (React Native screen, extension
 * background worker, dev harness) and the controller injected into the
 * streaming site's page.
 *
 * Every message is wrapped in an envelope carrying a per-session nonce. The
 * page is third-party code, so the host only trusts envelopes with the nonce
 * it generated when injecting the controller.
 *
 * Validation is hand-written rather than zod-based on purpose: this module is
 * bundled into the script injected into every streaming page, which should
 * stay a few kilobytes.
 */

export const PLAYER_MESSAGE_SOURCE = 'watch-party';
export const PLAYER_MESSAGE_VERSION = 1;

export type PlayerAction = 'PLAY' | 'PAUSE' | 'SEEK';
export type PlayerErrorCode = 'AUTOPLAY_BLOCKED' | 'SEEK_FAILED' | 'PLAYBACK_FAILED';

export type PlayerEvent =
  | {
      type: 'PLAYER_EVENT';
      action: PlayerAction;
      timecode: number;
      /** Local epoch ms when the action happened. */
      at: number;
    }
  | {
      type: 'PLAYER_STATUS';
      timecode: number;
      paused: boolean;
      buffering: boolean;
      playbackRate: number;
      duration: number | null;
      at: number;
    }
  | { type: 'PLAYER_ATTACHED'; duration: number | null }
  | { type: 'PLAYER_DETACHED' }
  | { type: 'PLAYER_ERROR'; code: PlayerErrorCode; message: string };

export type PlayerCommand =
  /** Apply a play/pause/seek someone else performed. */
  | {
      type: 'APPLY';
      action: PlayerAction;
      timecode: number;
      /** Local epoch ms at which `timecode` was accurate. */
      asOf: number;
    }
  /** Continuous drift correction against the host's playhead. */
  | {
      type: 'SYNC';
      timecode: number;
      asOf: number;
      paused: boolean;
      playbackRate: number;
    }
  | { type: 'REQUEST_STATUS' };

export interface PlayerEnvelope<T> {
  source: typeof PLAYER_MESSAGE_SOURCE;
  v: typeof PLAYER_MESSAGE_VERSION;
  nonce: string;
  message: T;
}

export function wrapPlayerMessage<T>(nonce: string, message: T): PlayerEnvelope<T> {
  return { source: PLAYER_MESSAGE_SOURCE, v: PLAYER_MESSAGE_VERSION, nonce, message };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isTimecode = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 86_400;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isAction = (v: unknown): v is PlayerAction => v === 'PLAY' || v === 'PAUSE' || v === 'SEEK';
const isRate = (v: unknown): v is number => isNum(v) && v >= 0.25 && v <= 4;
const isDuration = (v: unknown): v is number | null => v === null || (isNum(v) && v >= 0);
const ERROR_CODES: readonly unknown[] = ['AUTOPLAY_BLOCKED', 'SEEK_FAILED', 'PLAYBACK_FAILED'];

/** Structural validation of a page -> host message. */
export function validatePlayerEvent(m: unknown): PlayerEvent | null {
  if (!isObj(m)) return null;
  switch (m.type) {
    case 'PLAYER_EVENT':
      return isAction(m.action) && isTimecode(m.timecode) && isNum(m.at)
        ? { type: m.type, action: m.action, timecode: m.timecode, at: m.at }
        : null;
    case 'PLAYER_STATUS':
      return isTimecode(m.timecode) &&
        isBool(m.paused) &&
        isBool(m.buffering) &&
        isNum(m.playbackRate) &&
        isDuration(m.duration) &&
        isNum(m.at)
        ? {
            type: m.type,
            timecode: m.timecode,
            paused: m.paused,
            buffering: m.buffering,
            playbackRate: m.playbackRate,
            duration: m.duration,
            at: m.at,
          }
        : null;
    case 'PLAYER_ATTACHED':
      return isDuration(m.duration) ? { type: m.type, duration: m.duration } : null;
    case 'PLAYER_DETACHED':
      return { type: m.type };
    case 'PLAYER_ERROR':
      return ERROR_CODES.includes(m.code) && typeof m.message === 'string'
        ? { type: m.type, code: m.code as PlayerErrorCode, message: m.message.slice(0, 500) }
        : null;
    default:
      return null;
  }
}

/** Structural validation of a host -> page message. */
export function validatePlayerCommand(m: unknown): PlayerCommand | null {
  if (!isObj(m)) return null;
  switch (m.type) {
    case 'APPLY':
      return isAction(m.action) && isTimecode(m.timecode) && isNum(m.asOf)
        ? { type: m.type, action: m.action, timecode: m.timecode, asOf: m.asOf }
        : null;
    case 'SYNC':
      return isTimecode(m.timecode) && isNum(m.asOf) && isBool(m.paused) && isRate(m.playbackRate)
        ? {
            type: m.type,
            timecode: m.timecode,
            asOf: m.asOf,
            paused: m.paused,
            playbackRate: m.playbackRate,
          }
        : null;
    case 'REQUEST_STATUS':
      return { type: m.type };
    default:
      return null;
  }
}

function unwrap(raw: unknown, nonce: string): unknown {
  let value = raw;
  if (typeof value === 'string') {
    if (value.length > 10_000) return undefined;
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!isObj(value)) return undefined;
  if (value.source !== PLAYER_MESSAGE_SOURCE || value.v !== PLAYER_MESSAGE_VERSION) return undefined;
  if (typeof nonce !== 'string' || nonce.length === 0 || value.nonce !== nonce) return undefined;
  return value.message;
}

/** Parses a message from the page. Returns null for anything untrusted or malformed. */
export function parsePlayerEvent(raw: unknown, nonce: string): PlayerEvent | null {
  return validatePlayerEvent(unwrap(raw, nonce));
}

/** Parses a command from the host. Returns null for anything untrusted or malformed. */
export function parsePlayerCommand(raw: unknown, nonce: string): PlayerCommand | null {
  return validatePlayerCommand(unwrap(raw, nonce));
}
