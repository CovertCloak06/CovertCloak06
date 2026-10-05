/**
 * Platform-agnostic controller for a streaming site's HTML5 video element.
 *
 * It runs inside the streaming page (mobile WebView or extension content
 * script) and does three things:
 * 1. Finds the primary <video>, and keeps finding it as single-page players
 *    create, replace and destroy elements (trailers, ads, next episode).
 * 2. Reports local play/pause/seek actions and a periodic status.
 * 3. Applies remote actions and drift corrections without echoing them back.
 *
 * Privacy: the controller only ever queries <video> elements. It never reads
 * inputs, forms, cookies or storage, so credentials typed into the service's
 * login page are never visible to it (spec rule 3).
 *
 * Echo suppression: instead of the spec's "ignore everything for 300ms" flag,
 * each remote action registers the state it expects to produce (paused or not,
 * a seek target) with a generous deadline. A media event is suppressed only if
 * it matches an outstanding expectation. Slow seeks therefore can't leak an
 * echo, and a genuine user action during the window still gets through
 * because it won't match.
 */
import { computeCorrection, SYNC_RULES } from '../sync.js';
import type { PlayerAdapter } from './adapters.js';
import type { PlayerCommand, PlayerEvent } from './messages.js';

export interface PlayerControllerOptions {
  doc: Document;
  adapter: PlayerAdapter;
  send: (event: PlayerEvent) => void;
  now?: () => number;
  statusIntervalMs?: number;
  /** Scrubbing fires many seeks; only the last one in this window is sent. */
  seekDebounceMs?: number;
  /** How long a remote action's expected media events are suppressed. */
  expectationMs?: number;
  /** A remote PLAY blocked by autoplay policy is honoured on the next local play within this window. */
  blockedPlayGraceMs?: number;
}

interface StateExpectation {
  paused: boolean;
  until: number;
}
interface SeekExpectation {
  target: number;
  until: number;
}
interface RemoteTarget {
  timecode: number;
  asOf: number;
  until: number;
}

const MEDIA_EVENTS = [
  'play',
  'pause',
  'seeking',
  'seeked',
  'waiting',
  'playing',
  'canplay',
  'loadedmetadata',
  'emptied',
  'error',
] as const;

/** Seek events within this distance of the expected target count as ours. */
const SEEK_MATCH_TOLERANCE_S = 1.5;

/**
 * Picks the element most likely to be the feature: the largest visible video,
 * preferring ones with media loaded and a feature-length duration (ads and
 * preview tiles are short or tiny). Open shadow roots are searched too.
 */
export function findPrimaryVideo(doc: Document): HTMLVideoElement | null {
  const videos = collectVideos(doc);
  let best: HTMLVideoElement | null = null;
  let bestScore = -1;
  for (const video of videos) {
    const rect = video.getBoundingClientRect();
    const area = Math.max(rect.width * rect.height, 1);
    let score = area;
    if (video.readyState >= 1) score *= 2;
    if (Number.isFinite(video.duration) && video.duration > 600) score *= 4;
    if (!video.paused) score *= 1.5;
    if (score > bestScore) {
      best = video;
      bestScore = score;
    }
  }
  return best;
}

function collectVideos(doc: Document): HTMLVideoElement[] {
  const found = Array.from(doc.querySelectorAll('video'));
  if (found.length > 0) return found;
  // Some players render inside (open) shadow roots, which querySelectorAll skips.
  const out: HTMLVideoElement[] = [];
  const stack: Array<Document | ShadowRoot> = [doc];
  let budget = 5_000;
  while (stack.length > 0 && budget > 0) {
    const root = stack.pop()!;
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (--budget <= 0) break;
      if (el instanceof HTMLVideoElement) out.push(el);
      if (el.shadowRoot) stack.push(el.shadowRoot);
    }
  }
  return out;
}

export class PlayerController {
  private readonly doc: Document;
  private readonly adapter: PlayerAdapter;
  private readonly send: (event: PlayerEvent) => void;
  private readonly now: () => number;
  private readonly statusIntervalMs: number;
  private readonly seekDebounceMs: number;
  private readonly expectationMs: number;
  private readonly blockedPlayGraceMs: number;

  private video: HTMLVideoElement | null = null;
  private observer: MutationObserver | null = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private rescanTimer: ReturnType<typeof setTimeout> | null = null;
  private seekTimer: ReturnType<typeof setTimeout> | null = null;
  private buffering = false;
  private appliedRate = 1;
  private expectState: StateExpectation | null = null;
  private expectSeek: SeekExpectation | null = null;
  private blockedPlay: RemoteTarget | null = null;
  private started = false;

  constructor(options: PlayerControllerOptions) {
    this.doc = options.doc;
    this.adapter = options.adapter;
    this.send = options.send;
    this.now = options.now ?? (() => Date.now());
    this.statusIntervalMs = options.statusIntervalMs ?? 1_000;
    this.seekDebounceMs = options.seekDebounceMs ?? 250;
    this.expectationMs = options.expectationMs ?? 4_000;
    this.blockedPlayGraceMs = options.blockedPlayGraceMs ?? 60_000;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.rescan();
    const view = this.doc.defaultView;
    if (view && 'MutationObserver' in view) {
      this.observer = new view.MutationObserver(() => this.scheduleRescan());
      this.observer.observe(this.doc.documentElement, { childList: true, subtree: true });
    }
    this.statusTimer = setInterval(() => {
      // Videos inside shadow roots don't trigger the observer; rescan cheaply.
      if (!this.video || !this.video.isConnected) this.rescan();
      this.sendStatus();
    }, this.statusIntervalMs);
  }

  stop(): void {
    this.started = false;
    this.observer?.disconnect();
    this.observer = null;
    if (this.statusTimer) clearInterval(this.statusTimer);
    if (this.rescanTimer) clearTimeout(this.rescanTimer);
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.statusTimer = this.rescanTimer = this.seekTimer = null;
    this.detach();
  }

  /** The element currently controlled (exposed for tests and debugging). */
  get currentVideo(): HTMLVideoElement | null {
    return this.video;
  }

  handleCommand(command: PlayerCommand): void {
    switch (command.type) {
      case 'REQUEST_STATUS':
        this.sendStatus();
        return;
      case 'APPLY':
        this.applyRemoteAction(command.action, command.timecode, command.asOf);
        return;
      case 'SYNC':
        this.applySync(command.timecode, command.asOf, command.paused, command.playbackRate);
        return;
    }
  }

  // ---------------------------------------------------------------------------
  // Video discovery
  // ---------------------------------------------------------------------------

  private scheduleRescan(): void {
    if (this.rescanTimer) return;
    this.rescanTimer = setTimeout(() => {
      this.rescanTimer = null;
      this.rescan();
    }, 250);
  }

  private rescan(): void {
    const next = findPrimaryVideo(this.doc);
    if (next === this.video) return;
    this.detach();
    if (next) this.attach(next);
  }

  private attach(video: HTMLVideoElement): void {
    this.video = video;
    this.appliedRate = 1;
    for (const name of MEDIA_EVENTS) video.addEventListener(name, this.onMediaEvent);
    this.send({ type: 'PLAYER_ATTACHED', duration: this.duration() });
    this.sendStatus();
  }

  private detach(): void {
    const video = this.video;
    if (!video) return;
    for (const name of MEDIA_EVENTS) video.removeEventListener(name, this.onMediaEvent);
    this.video = null;
    this.expectState = this.expectSeek = null;
    this.send({ type: 'PLAYER_DETACHED' });
  }

  // ---------------------------------------------------------------------------
  // Local events -> host
  // ---------------------------------------------------------------------------

  private readonly onMediaEvent = (event: Event): void => {
    const video = this.video;
    if (!video || event.target !== video) return;
    const now = this.now();

    switch (event.type) {
      case 'play':
        if (this.consumeState(false, now)) return;
        if (this.honourBlockedPlay(video, now)) return;
        this.emitAction('PLAY', video.currentTime, now);
        return;
      case 'pause':
        // `ended` also fires pause; that is a real state change worth sharing.
        if (this.consumeState(true, now)) return;
        this.emitAction('PAUSE', video.currentTime, now);
        return;
      case 'seeked': {
        const exp = this.expectSeek;
        if (exp && now <= exp.until) {
          if (Math.abs(video.currentTime - exp.target) <= SEEK_MATCH_TOLERANCE_S) return;
          this.expectSeek = null;
        }
        this.debounceSeek();
        return;
      }
      case 'waiting':
        this.buffering = true;
        this.sendStatus();
        return;
      case 'playing':
      case 'canplay':
        if (this.buffering) {
          this.buffering = false;
          this.sendStatus();
        }
        return;
      case 'loadedmetadata':
        this.send({ type: 'PLAYER_ATTACHED', duration: this.duration() });
        return;
      case 'emptied':
        this.scheduleRescan();
        return;
      case 'error': {
        // MEDIA_ERR_DECODE (3) / SRC_NOT_SUPPORTED (4) inside a WebView usually
        // means the DRM pipeline refused playback: the host offers the native app.
        const code = video.error?.code ?? 0;
        this.send({
          type: 'PLAYER_ERROR',
          code: 'PLAYBACK_FAILED',
          message: `media error ${code}${video.error?.message ? `: ${video.error.message.slice(0, 200)}` : ''}`,
        });
        return;
      }
      default:
        return;
    }
  };

  /** True (and the event is swallowed) when it matches a pending remote state. */
  private consumeState(paused: boolean, now: number): boolean {
    const exp = this.expectState;
    if (!exp) return false;
    if (now > exp.until) {
      this.expectState = null;
      return false;
    }
    if (exp.paused === paused) return true;
    // A contradicting event is a genuine user action; stop suppressing.
    this.expectState = null;
    return false;
  }

  /**
   * After a remote PLAY failed on autoplay policy the user has to tap play.
   * That tap must rejoin the room's position, not broadcast this device's
   * stale playhead to everyone else.
   */
  private honourBlockedPlay(video: HTMLVideoElement, now: number): boolean {
    const blocked = this.blockedPlay;
    this.blockedPlay = null;
    if (!blocked || now > blocked.until) return false;
    const target = blocked.timecode + (now - blocked.asOf) / 1000;
    if (Math.abs(video.currentTime - target) > SYNC_RULES.hardSeekThresholdSeconds) {
      this.seekTo(video, target, now);
    }
    this.sendStatus();
    return true;
  }

  private debounceSeek(): void {
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(() => {
      this.seekTimer = null;
      const video = this.video;
      if (video) this.emitAction('SEEK', video.currentTime, this.now());
    }, this.seekDebounceMs);
  }

  private emitAction(action: 'PLAY' | 'PAUSE' | 'SEEK', timecode: number, at: number): void {
    this.send({ type: 'PLAYER_EVENT', action, timecode: clampTimecode(timecode), at });
  }

  private sendStatus(): void {
    const video = this.video;
    if (!video) return;
    this.send({
      type: 'PLAYER_STATUS',
      timecode: clampTimecode(video.currentTime),
      paused: video.paused,
      buffering: this.buffering || video.readyState < 3,
      playbackRate: video.playbackRate,
      duration: this.duration(),
      at: this.now(),
    });
  }

  private duration(): number | null {
    const d = this.video?.duration;
    return d !== undefined && Number.isFinite(d) && d > 0 ? d : null;
  }

  // ---------------------------------------------------------------------------
  // Remote commands -> video
  // ---------------------------------------------------------------------------

  private applyRemoteAction(
    action: 'PLAY' | 'PAUSE' | 'SEEK',
    timecode: number,
    asOf: number,
  ): void {
    const video = this.video;
    if (!video) return;
    const now = this.now();
    const willPlay = action === 'PLAY' || (action === 'SEEK' && !video.paused);
    const target = willPlay ? timecode + Math.max(0, now - asOf) / 1000 : timecode;

    const correction = computeCorrection({
      local: video.currentTime,
      target,
      paused: !willPlay,
      supportsRate: false, // discrete actions always land exactly
    });
    if (action === 'SEEK' || correction.kind === 'seek') this.seekTo(video, target, now);

    if (action === 'PLAY' && video.paused) {
      this.expectState = { paused: false, until: now + this.expectationMs };
      this.adapter.play(video).catch((err: unknown) => {
        this.expectState = null;
        this.blockedPlay = { timecode, asOf, until: this.now() + this.blockedPlayGraceMs };
        this.send({
          type: 'PLAYER_ERROR',
          code: 'AUTOPLAY_BLOCKED',
          message: err instanceof Error ? err.message.slice(0, 500) : 'play() was rejected',
        });
      });
    } else if (action === 'PAUSE' && !video.paused) {
      this.expectState = { paused: true, until: now + this.expectationMs };
      this.adapter.pause(video);
    }
    if (action !== 'PLAY') this.blockedPlay = null;
    this.resetRate(video);
  }

  private applySync(timecode: number, asOf: number, paused: boolean, playbackRate: number): void {
    const video = this.video;
    if (!video || this.buffering) return;
    const now = this.now();
    const target = paused ? timecode : timecode + (Math.max(0, now - asOf) / 1000) * playbackRate;

    // A state mismatch (host playing, we're paused) is fixed with a discrete action.
    if (video.paused !== paused) {
      this.applyRemoteAction(paused ? 'PAUSE' : 'PLAY', timecode, asOf);
      return;
    }

    const correction = computeCorrection({
      local: video.currentTime,
      target,
      paused,
      currentRate: this.appliedRate,
      supportsRate: this.adapter.supportsRate,
    });
    if (correction.kind === 'seek') {
      this.seekTo(video, correction.target, now);
      this.resetRate(video);
    } else if (correction.kind === 'rate') {
      this.setRate(video, correction.rate * playbackRate);
    } else {
      this.resetRate(video, playbackRate);
    }
  }

  private seekTo(video: HTMLVideoElement, target: number, now: number): void {
    const t = clampTimecode(target);
    this.expectSeek = { target: t, until: now + this.expectationMs };
    try {
      this.adapter.seek(video, t);
    } catch (err) {
      this.expectSeek = null;
      this.send({
        type: 'PLAYER_ERROR',
        code: 'SEEK_FAILED',
        message: err instanceof Error ? err.message.slice(0, 500) : 'seek failed',
      });
    }
  }

  private setRate(video: HTMLVideoElement, rate: number): void {
    if (Math.abs(video.playbackRate - rate) < 1e-3) return;
    video.playbackRate = rate;
    this.appliedRate = rate;
  }

  private resetRate(video: HTMLVideoElement, base = 1): void {
    if (this.appliedRate !== 1 || video.playbackRate !== base) {
      video.playbackRate = base;
    }
    this.appliedRate = 1;
  }
}

function clampTimecode(t: number): number {
  return Number.isFinite(t) ? Math.min(Math.max(0, t), 86_400) : 0;
}
