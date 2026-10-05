/**
 * A jsdom <video> with simulated media behaviour. jsdom does not implement
 * playback, so state and event timing are scripted here. Event delays are
 * configurable to reproduce slow players (the case that breaks naive
 * time-window echo suppression).
 */
export interface FakeVideoOptions {
  duration?: number;
  /** Delay before `seeked` fires after a currentTime write. */
  seekDelayMs?: number;
  /** Delay before `play`/`pause` events fire. */
  eventDelayMs?: number;
  blockAutoplay?: boolean;
}

export type FakeVideo = HTMLVideoElement & {
  fake: {
    time: number;
    paused: boolean;
    seekWrites: number[];
    blockAutoplay: boolean;
    /** Simulate the user pressing pause/play/seeking in the site's own UI. */
    userPause(): void;
    userPlay(): void;
    userSeek(t: number): void;
    /** Advance the playhead as if `seconds` of media played. */
    advance(seconds: number): void;
  };
};

export function createFakeVideo(doc: Document, opts: FakeVideoOptions = {}): FakeVideo {
  const video = doc.createElement('video') as FakeVideo;
  const seekDelay = opts.seekDelayMs ?? 50;
  const eventDelay = opts.eventDelayMs ?? 0;
  let rate = 1;
  const fire = (type: string, delay = eventDelay) =>
    setTimeout(() => video.dispatchEvent(new Event(type)), delay);

  const state = {
    time: 0,
    paused: true,
    seekWrites: [] as number[],
    blockAutoplay: opts.blockAutoplay ?? false,
    userPause() {
      if (state.paused) return;
      state.paused = true;
      fire('pause');
    },
    userPlay() {
      if (!state.paused) return;
      state.paused = false;
      fire('play');
    },
    userSeek(t: number) {
      state.time = t;
      fire('seeking', 0);
      fire('seeked', seekDelay);
    },
    advance(seconds: number) {
      if (!state.paused) state.time += seconds * rate;
    },
  };
  video.fake = state;

  Object.defineProperties(video, {
    paused: { get: () => state.paused },
    currentTime: {
      get: () => state.time,
      set: (t: number) => {
        state.seekWrites.push(t);
        state.time = t;
        fire('seeking', 0);
        fire('seeked', seekDelay);
      },
    },
    duration: { get: () => opts.duration ?? 7_200 },
    readyState: { get: () => 4 },
    playbackRate: {
      get: () => rate,
      set: (r: number) => {
        rate = r;
      },
    },
  });
  video.play = () => {
    if (state.blockAutoplay) {
      const err = new Error('play() failed because the user did not interact first');
      err.name = 'NotAllowedError';
      return Promise.reject(err);
    }
    if (state.paused) {
      state.paused = false;
      fire('play');
    }
    return Promise.resolve();
  };
  video.pause = () => {
    if (!state.paused) {
      state.paused = true;
      fire('pause');
    }
  };
  return video;
}
