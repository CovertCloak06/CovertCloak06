/**
 * Player adapters isolate per-service quirks from the controller.
 *
 * Most services play through a plain HTML5 <video> element that tolerates
 * direct `currentTime` writes. Netflix does not: writing `currentTime` on its
 * element desynchronises its MSE pipeline and ends in the M7375 error screen.
 * Netflix must be seeked through its own player API, which only exists in the
 * page's JavaScript world.
 */
import type { PlayerAdapterId } from '../services.js';

export interface PlayerAdapter {
  id: PlayerAdapterId;
  /** False for players that misbehave when playbackRate changes. */
  supportsRate: boolean;
  seek(video: HTMLVideoElement, seconds: number): void;
  play(video: HTMLVideoElement): Promise<void>;
  pause(video: HTMLVideoElement): void;
}

export const genericAdapter: PlayerAdapter = {
  id: 'generic',
  supportsRate: true,
  seek(video, seconds) {
    const max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
    video.currentTime = Math.min(Math.max(0, seconds), max);
  },
  play(video) {
    // play() returns undefined in some older WebViews.
    return Promise.resolve(video.play());
  },
  pause(video) {
    video.pause();
  },
};

/** Seeks Netflix to an absolute position in ms. Returns false when unavailable. */
export type NetflixSeek = (ms: number) => boolean;

export function createNetflixAdapter(seekMs: NetflixSeek): PlayerAdapter {
  return {
    ...genericAdapter,
    id: 'netflix',
    seek(video, seconds) {
      if (!seekMs(Math.round(Math.max(0, seconds) * 1000))) {
        // Last resort: may trip Netflix's error screen, but a stuck playhead is worse.
        genericAdapter.seek(video, seconds);
      }
    },
  };
}

interface NetflixVideoPlayer {
  seek(ms: number): void;
}
interface NetflixPlayerApi {
  getAllPlayerSessionIds(): string[];
  getVideoPlayerBySessionId(id: string): NetflixVideoPlayer | undefined;
}

/**
 * Netflix seek using the page-world player API
 * (`netflix.appContext.state.playerApp.getAPI().videoPlayer`). The API is
 * undocumented, so every step is defensive and failure falls back cleanly.
 */
export function netflixPageSeek(win: Window): NetflixSeek {
  return (ms) => {
    try {
      const nf = (win as unknown as { netflix?: any }).netflix;
      const api: NetflixPlayerApi | undefined =
        nf?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
      if (!api) return false;
      const ids = api.getAllPlayerSessionIds();
      const id = ids.find((s) => s.startsWith('watch')) ?? ids[0];
      const player = id ? api.getVideoPlayerBySessionId(id) : undefined;
      if (!player) return false;
      player.seek(ms);
      return true;
    } catch {
      return false;
    }
  };
}
