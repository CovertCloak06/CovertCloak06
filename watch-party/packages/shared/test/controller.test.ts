// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNetflixAdapter, genericAdapter } from '../src/player/adapters.js';
import { PlayerController } from '../src/player/controller.js';
import type { PlayerEvent } from '../src/player/messages.js';
import { createFakeVideo, type FakeVideoOptions } from './fake-video.js';

let events: PlayerEvent[];
let controller: PlayerController | null;

function setup(opts: FakeVideoOptions = {}, adapter = genericAdapter) {
  const video = createFakeVideo(document, opts);
  document.body.appendChild(video);
  controller = new PlayerController({ doc: document, adapter, send: (e) => events.push(e) });
  controller.start();
  return { video, controller };
}

const actions = () =>
  events.filter(
    (e): e is Extract<PlayerEvent, { type: 'PLAYER_EVENT' }> => e.type === 'PLAYER_EVENT',
  );

async function flush(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
  events = [];
  document.body.innerHTML = '';
});

afterEach(() => {
  controller?.stop();
  controller = null;
  vi.useRealTimers();
});

describe('video discovery', () => {
  it('attaches to a video that appears after start and follows replacements', async () => {
    controller = new PlayerController({
      doc: document,
      adapter: genericAdapter,
      send: (e) => events.push(e),
    });
    controller.start();
    expect(controller.currentVideo).toBeNull();

    const first = createFakeVideo(document);
    document.body.appendChild(first);
    await flush(300);
    expect(controller.currentVideo).toBe(first);
    expect(events.some((e) => e.type === 'PLAYER_ATTACHED')).toBe(true);

    first.remove();
    const second = createFakeVideo(document);
    document.body.appendChild(second);
    await flush(300);
    expect(controller.currentVideo).toBe(second);
    expect(events.some((e) => e.type === 'PLAYER_DETACHED')).toBe(true);
  });

  it('sends periodic status', async () => {
    const { video } = setup();
    video.fake.time = 42;
    events = [];
    await flush(1_000);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'PLAYER_STATUS', timecode: 42, paused: true }),
    );
  });
});

describe('local actions', () => {
  it('reports user play, pause and debounced seeks', async () => {
    const { video } = setup();
    video.fake.userPlay();
    await flush(10);
    video.fake.time = 30;
    video.fake.userPause();
    await flush(10);
    video.fake.userSeek(100);
    await flush(60);
    video.fake.userSeek(200);
    await flush(60);
    video.fake.userSeek(300);
    await flush(400);
    expect(actions().map((a) => [a.action, a.timecode])).toEqual([
      ['PLAY', 0],
      ['PAUSE', 30],
      ['SEEK', 300],
    ]);
  });
});

describe('echo suppression', () => {
  it('does not echo a remote pause whose event arrives late', async () => {
    const { video, controller } = setup({ eventDelayMs: 1_200 });
    video.fake.paused = false;
    video.fake.time = 50;
    controller.handleCommand({ type: 'APPLY', action: 'PAUSE', timecode: 50, asOf: Date.now() });
    await flush(2_000);
    expect(video.paused).toBe(true);
    expect(actions()).toEqual([]);
  });

  it('does not echo a remote seek even when seeked fires seconds later', async () => {
    const { video, controller } = setup({ seekDelayMs: 2_500 });
    controller.handleCommand({ type: 'APPLY', action: 'SEEK', timecode: 600, asOf: Date.now() });
    await flush(3_000);
    expect(video.currentTime).toBe(600);
    expect(actions()).toEqual([]);
  });

  it('still reports a genuine user action during the suppression window', async () => {
    const { video, controller } = setup();
    controller.handleCommand({ type: 'APPLY', action: 'PLAY', timecode: 0, asOf: Date.now() });
    await flush(10);
    expect(video.paused).toBe(false);
    video.fake.userPause();
    await flush(10);
    expect(actions().map((a) => a.action)).toEqual(['PAUSE']);
  });

  it('projects a remote play forward by its age and seeks past the 1s threshold', async () => {
    const { video, controller } = setup();
    controller.handleCommand({
      type: 'APPLY',
      action: 'PLAY',
      timecode: 100,
      asOf: Date.now() - 3_000,
    });
    await flush(100);
    expect(video.fake.seekWrites).toEqual([103]);
    expect(video.paused).toBe(false);
    expect(actions()).toEqual([]);
  });

  it('does not seek on a remote play when already within threshold', async () => {
    const { video, controller } = setup();
    video.fake.time = 99.6;
    controller.handleCommand({ type: 'APPLY', action: 'PLAY', timecode: 100, asOf: Date.now() });
    await flush(100);
    expect(video.fake.seekWrites).toEqual([]);
  });
});

describe('drift correction', () => {
  it('nudges rate for micro drift, seeks for large drift, and resets inside the deadband', async () => {
    const { video, controller } = setup();
    video.fake.paused = false;

    video.fake.time = 99.5;
    controller.handleCommand({
      type: 'SYNC',
      timecode: 100,
      asOf: Date.now(),
      paused: false,
      playbackRate: 1,
    });
    expect(video.playbackRate).toBe(1.05);

    video.fake.time = 100.02;
    controller.handleCommand({
      type: 'SYNC',
      timecode: 100,
      asOf: Date.now(),
      paused: false,
      playbackRate: 1,
    });
    expect(video.playbackRate).toBe(1);

    video.fake.time = 97;
    controller.handleCommand({
      type: 'SYNC',
      timecode: 100,
      asOf: Date.now(),
      paused: false,
      playbackRate: 1,
    });
    expect(video.fake.seekWrites).toEqual([100]);
    await flush(500);
    expect(actions()).toEqual([]);
  });

  it('fixes a play/pause mismatch with a discrete action', async () => {
    const { video, controller } = setup();
    controller.handleCommand({
      type: 'SYNC',
      timecode: 10,
      asOf: Date.now(),
      paused: false,
      playbackRate: 1,
    });
    await flush(10);
    expect(video.paused).toBe(false);
    expect(actions()).toEqual([]);
  });
});

describe('autoplay policy', () => {
  it('reports a blocked play, then rejoins the room position on the next tap without broadcasting', async () => {
    const { video, controller } = setup({ blockAutoplay: true });
    controller.handleCommand({ type: 'APPLY', action: 'PLAY', timecode: 500, asOf: Date.now() });
    await flush(10);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'PLAYER_ERROR', code: 'AUTOPLAY_BLOCKED' }),
    );
    // The remote PLAY seeked us to 500 already; 20s later the user taps play.
    await flush(20_000);
    video.fake.blockAutoplay = false;
    video.fake.userPlay();
    await flush(10);
    expect(video.fake.seekWrites.at(-1)).toBeCloseTo(520, 0);
    expect(actions()).toEqual([]);
  });
});

describe('media errors', () => {
  it('reports playback failures so the host can offer the native app', async () => {
    const { video } = setup();
    Object.defineProperty(video, 'error', {
      get: () => ({ code: 4, message: 'DRM not supported' }),
    });
    video.dispatchEvent(new Event('error'));
    expect(events).toContainEqual({
      type: 'PLAYER_ERROR',
      code: 'PLAYBACK_FAILED',
      message: 'media error 4: DRM not supported',
    });
  });
});

describe('netflix adapter', () => {
  it('seeks through the player API instead of writing currentTime', async () => {
    const seekMs = vi.fn(() => true);
    const { video, controller } = setup({}, createNetflixAdapter(seekMs));
    controller.handleCommand({ type: 'APPLY', action: 'SEEK', timecode: 61.5, asOf: Date.now() });
    expect(seekMs).toHaveBeenCalledWith(61_500);
    expect(video.fake.seekWrites).toEqual([]);
  });
  it('falls back to currentTime when the API is unavailable', () => {
    const { video, controller } = setup(
      {},
      createNetflixAdapter(() => false),
    );
    controller.handleCommand({ type: 'APPLY', action: 'SEEK', timecode: 10, asOf: Date.now() });
    expect(video.fake.seekWrites).toEqual([10]);
  });
});
