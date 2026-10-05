/**
 * Synchronisation math shared by every client and the server.
 *
 * Two problems are solved here:
 * 1. Clocks differ between devices. {@link ClockSync} estimates each client's
 *    offset from the server clock so timestamps can be compared across
 *    countries, NTP-style.
 * 2. Playheads drift. {@link computeCorrection} turns a measured drift into
 *    either nothing, a gentle playback-rate nudge, or a hard seek, following
 *    the spec's thresholds.
 */

export const SYNC_RULES = {
  /** Drift beyond this triggers a hard seek during playback (spec: 1.0s). */
  hardSeekThresholdSeconds: 1.0,
  /**
   * While paused there is no audio to jump, so a tighter threshold is used and
   * everyone resumes from the same frame.
   */
  pausedSeekThresholdSeconds: 0.25,
  /** Drift inside this band is ignored and the rate returns to 1.0. */
  deadbandSeconds: 0.15,
  /**
   * Once a rate nudge is active it continues until drift falls inside this
   * smaller band. The gap between the two bands prevents rate flapping.
   */
  releaseBandSeconds: 0.05,
  /** Spec: `video.playbackRate = 1.05` to catch up. */
  catchUpRate: 1.05,
  slowDownRate: 0.95,
  /** How often the host reports its playhead while playing. */
  heartbeatIntervalMs: 2_000,
  /** Actions older than this on arrival are applied without time projection. */
  maxProjectionMs: 10_000,
  /** Client timestamps further than this from server time are distrusted. */
  maxClientSkewMs: 5_000,
} as const;

export interface TimedPlayback {
  paused: boolean;
  /** Playhead in seconds, accurate at `timestamp`. */
  timecode: number;
  /** Epoch ms (server clock) when `timecode` was accurate. */
  timestamp: number;
  playbackRate: number;
}

/**
 * Where the playhead is now, given a state that was accurate at some earlier
 * moment. Paused states don't move. Projection is capped so a stale state
 * (e.g. after a long disconnect) can't throw the playhead far into the film.
 */
export function projectTimecode(state: TimedPlayback, nowMs: number): number {
  if (state.paused) return state.timecode;
  const elapsedMs = Math.min(Math.max(0, nowMs - state.timestamp), SYNC_RULES.maxProjectionMs);
  return state.timecode + (elapsedMs / 1000) * state.playbackRate;
}

export type Correction =
  | { kind: 'none'; rate: 1 }
  | { kind: 'rate'; rate: number; drift: number }
  | { kind: 'seek'; target: number; drift: number };

export interface CorrectionInput {
  /** Local playhead, seconds. */
  local: number;
  /** Where the reference (host) playhead is right now, seconds. */
  target: number;
  paused: boolean;
  /** The playback rate currently applied locally, for hysteresis. */
  currentRate?: number;
  /** Players that ignore playbackRate (some DRM pipelines) only ever seek. */
  supportsRate?: boolean;
}

/**
 * Decides how to bring a local playhead back to the reference.
 *
 * - |drift| > 1.0s while playing (0.25s while paused): hard seek.
 * - Small drift while playing: nudge playbackRate to 1.05 (behind) or 0.95
 *   (ahead) so audio never jumps. Once nudging, keep going until drift is
 *   inside the release band; start nudging only outside the deadband.
 * - Otherwise: play at 1.0.
 */
export function computeCorrection(input: CorrectionInput): Correction {
  const { local, target, paused, currentRate = 1, supportsRate = true } = input;
  const drift = local - target;
  const magnitude = Math.abs(drift);

  if (paused) {
    return magnitude > SYNC_RULES.pausedSeekThresholdSeconds
      ? { kind: 'seek', target, drift }
      : { kind: 'none', rate: 1 };
  }

  if (magnitude > SYNC_RULES.hardSeekThresholdSeconds) {
    return { kind: 'seek', target, drift };
  }

  if (!supportsRate) return { kind: 'none', rate: 1 };

  const nudging = currentRate !== 1;
  const band = nudging ? SYNC_RULES.releaseBandSeconds : SYNC_RULES.deadbandSeconds;
  if (magnitude <= band) return { kind: 'none', rate: 1 };

  return {
    kind: 'rate',
    rate: drift < 0 ? SYNC_RULES.catchUpRate : SYNC_RULES.slowDownRate,
    drift,
  };
}

/**
 * Picks the most trustworthy timestamp for an incoming action: the sender's
 * own server-clock estimate when it is plausible, otherwise the moment the
 * server received it.
 */
export function sanitizeTimestamp(clientTimestamp: number, serverNow: number): number {
  return Math.abs(clientTimestamp - serverNow) <= SYNC_RULES.maxClientSkewMs
    ? Math.min(clientTimestamp, serverNow)
    : serverNow;
}

interface ClockSample {
  offset: number;
  rtt: number;
}

/**
 * Estimates the offset between this device's clock and the server's.
 *
 * Each ping records t0 (local send), the server time, and t1 (local receive).
 * Assuming symmetric latency, offset = serverTime - (t0 + t1) / 2. Network
 * jitter makes single samples noisy, so the estimate is the median offset of
 * the lowest-RTT samples in a sliding window: low-RTT samples have the least
 * room for asymmetric delay.
 */
export class ClockSync {
  private samples: ClockSample[] = [];

  constructor(
    private readonly windowSize = 16,
    private readonly bestOf = 5,
  ) {}

  addSample(t0: number, serverTime: number, t1: number): void {
    const rtt = t1 - t0;
    if (!(rtt >= 0) || !Number.isFinite(serverTime)) return;
    this.samples.push({ offset: serverTime - (t0 + t1) / 2, rtt });
    if (this.samples.length > this.windowSize) this.samples.shift();
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  /** True once enough samples exist for the offset to be trusted. */
  get isReliable(): boolean {
    return this.samples.length >= 3;
  }

  /** Estimated `serverClock - localClock` in ms (0 before any sample). */
  get offsetMs(): number {
    if (this.samples.length === 0) return 0;
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, this.bestOf);
    const offsets = best.map((s) => s.offset).sort((a, b) => a - b);
    const mid = Math.floor(offsets.length / 2);
    return offsets.length % 2 === 1 ? offsets[mid]! : (offsets[mid - 1]! + offsets[mid]!) / 2;
  }

  /** Median round-trip of the best samples, ms. */
  get rttMs(): number {
    if (this.samples.length === 0) return 0;
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, this.bestOf);
    return best[Math.floor(best.length / 2)]!.rtt;
  }

  /** Current time on the server's clock. */
  serverNow(localNow = Date.now()): number {
    return localNow + this.offsetMs;
  }

  toLocal(serverTime: number): number {
    return serverTime - this.offsetMs;
  }

  reset(): void {
    this.samples = [];
  }
}
