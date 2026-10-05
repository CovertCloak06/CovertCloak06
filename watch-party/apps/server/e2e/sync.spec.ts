/**
 * End-to-end synchronisation through the real pieces: the bundled injected
 * controller, the shared RoomSyncClient, Socket.io and the server, each tab
 * playing a real <video>. Tabs are separate browser contexts (separate
 * sessions), like two people in different countries.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

interface VideoState {
  t: number;
  paused: boolean;
  rate: number;
}

async function openMember(browser: Browser, name: string, room?: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (err) => console.error(`[${name}] pageerror`, err));
  const qs = new URLSearchParams({ name, ...(room ? { room } : {}) });
  await page.goto(`/dev/?${qs}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  // Wait until the injected controller has attached to the video.
  await expect
    .poll(() =>
      page.evaluate(() => document.getElementById('video') !== null && !!window.__watchParty),
    )
    .toBe(true);
  await page.evaluate(() => {
    const v = document.getElementById('video') as HTMLVideoElement;
    return v.readyState >= 1
      ? null
      : new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
  });
  return page;
}

const roomOf = (page: Page) => page.evaluate(() => window.harness!.roomId);
const state = (page: Page): Promise<VideoState> =>
  page.evaluate(() => {
    const v = document.getElementById('video') as HTMLVideoElement;
    return { t: v.currentTime, paused: v.paused, rate: v.playbackRate };
  });
const localActions = (page: Page) =>
  page.evaluate(() => window.harness!.log.filter((l) => / local (PLAY|PAUSE|SEEK)/.test(l)).length);

/** User-style actions: go through the element, exactly like the site's own controls. */
const play = (page: Page) =>
  page.evaluate(() => (document.getElementById('video') as HTMLVideoElement).play());
const pause = (page: Page) =>
  page.evaluate(() => (document.getElementById('video') as HTMLVideoElement).pause());
const seek = (page: Page, t: number) =>
  page.evaluate(
    (to) => ((document.getElementById('video') as HTMLVideoElement).currentTime = to),
    t,
  );

async function expectInSync(a: Page, b: Page, toleranceS: number) {
  await expect
    .poll(
      async () => {
        const [sa, sb] = await Promise.all([state(a), state(b)]);
        return Math.abs(sa.t - sb.t);
      },
      { timeout: 10_000, intervals: [200] },
    )
    .toBeLessThan(toleranceS);
}

test('two members stay in sync through play, pause, seek and control from either side', async ({
  browser,
}) => {
  const host = await openMember(browser, 'Ana (US)');
  const guest = await openMember(browser, 'Ben (UK)', await roomOf(host));
  await expect(host.locator('#members li')).toHaveCount(2);
  await expect(host.locator('#role')).toHaveText('host');
  await expect(guest.locator('#role')).toHaveText('guest');

  // Host presses play: guest starts too.
  await play(host);
  await expect.poll(async () => (await state(guest)).paused).toBe(false);
  await expectInSync(host, guest, 1.0);

  // Host pauses: guest pauses on (almost) the same frame.
  await host.waitForTimeout(1_500);
  await pause(host);
  await expect.poll(async () => (await state(guest)).paused).toBe(true);
  await expectInSync(host, guest, 0.3);

  // Host seeks while paused.
  await seek(host, 300);
  await expect.poll(async () => (await state(guest)).t, { timeout: 10_000 }).toBeGreaterThan(299);
  await expectInSync(host, guest, 0.3);

  // Guest takes control: resumes and later pauses; host follows.
  await play(guest);
  await expect.poll(async () => (await state(host)).paused).toBe(false);
  await guest.waitForTimeout(1_000);
  await pause(guest);
  await expect.poll(async () => (await state(host)).paused).toBe(true);
  await expectInSync(host, guest, 0.3);

  // No echo storms: each tab only reported the actions its "user" took
  // (play, pause, seek on the host; play, pause on the guest).
  await host.waitForTimeout(1_000);
  expect(await localActions(host)).toBe(3);
  expect(await localActions(guest)).toBe(2);
});

/**
 * Emulates a device whose media clock runs slow: whatever rate the controller
 * asks for, the element really plays at `factor` times that. The getter still
 * reports the requested rate, as a real element would.
 */
async function makeClockSlow(page: Page, factor: number) {
  await page.evaluate((f) => {
    const v = document.getElementById('video') as HTMLVideoElement & { __requestedRate?: number };
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate')!;
    if (v.__requestedRate === undefined) v.__requestedRate = desc.get!.call(v) as number;
    Object.defineProperty(v, 'playbackRate', {
      configurable: true,
      get: () => v.__requestedRate!,
      set: (r: number) => {
        v.__requestedRate = r;
        desc.set!.call(v, r * f);
      },
    });
    desc.set!.call(v, v.__requestedRate * f);
  }, factor);
}

async function maxDriftOver(a: Page, b: Page, ms: number, onSample?: (s: VideoState) => void) {
  let max = 0;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const [sa, sb] = await Promise.all([state(a), state(b)]);
    onSample?.(sb);
    max = Math.max(max, Math.abs(sa.t - sb.t));
    await a.waitForTimeout(250);
  }
  return max;
}

test('micro drift is corrected by nudging the playback rate (1.05), without any echo', async ({
  browser,
}) => {
  const host = await openMember(browser, 'Host');
  const guest = await openMember(browser, 'Guest', await roomOf(host));
  await play(host);
  await expect.poll(async () => (await state(guest)).paused).toBe(false);
  await expectInSync(host, guest, 1.0);

  // 3% slow clock: drift builds ~0.03s per second until the nudge kicks in;
  // 1.05 x 0.97 > 1 so the nudge wins it back without ever seeking.
  await makeClockSlow(guest, 0.97);
  const rates = new Set<number>();
  await maxDriftOver(host, guest, 8_000, (s) => rates.add(Math.round(s.rate * 100) / 100));
  const steadyMax = await maxDriftOver(host, guest, 10_000, (s) =>
    rates.add(Math.round(s.rate * 100) / 100),
  );
  expect(rates.has(1.05)).toBe(true);
  expect(steadyMax).toBeLessThan(0.5);
  expect(await localActions(guest)).toBe(0);
  expect(await localActions(host)).toBe(1);
});

test('drift a rate nudge cannot fix is hard-seeked past the 1s threshold, without any echo', async ({
  browser,
}) => {
  const host = await openMember(browser, 'Host');
  const guest = await openMember(browser, 'Guest', await roomOf(host));
  await play(host);
  await expect.poll(async () => (await state(guest)).paused).toBe(false);
  await expectInSync(host, guest, 1.0);

  await guest.evaluate(() => {
    const v = document.getElementById('video') as HTMLVideoElement;
    (window as unknown as { __seeks: number }).__seeks = 0;
    v.addEventListener('seeked', () => (window as unknown as { __seeks: number }).__seeks++);
  });
  // Half-speed "stall": 1.05 x 0.5 can never catch up, so corrective seeks must happen.
  await makeClockSlow(guest, 0.5);
  const maxDrift = await maxDriftOver(host, guest, 10_000);
  const seekCount = await guest.evaluate(() => (window as unknown as { __seeks: number }).__seeks);
  expect(seekCount).toBeGreaterThan(0);
  // Bounded by threshold + drift accumulated between 2s heartbeats (+ seek latency).
  expect(maxDrift).toBeLessThan(2.6);
  // Corrective seeks are never reported as user seeks, on either side.
  expect(await localActions(guest)).toBe(0);
  expect(await localActions(host)).toBe(1);
});

test('a late joiner catches up to the playing room', async ({ browser }) => {
  const host = await openMember(browser, 'Host');
  const room = await roomOf(host);
  await seek(host, 120);
  await play(host);
  await host.waitForTimeout(2_500);
  const late = await openMember(browser, 'Late', room);
  await expect.poll(async () => (await state(late)).paused, { timeout: 10_000 }).toBe(false);
  await expectInSync(host, late, 1.0);
  expect((await state(late)).t).toBeGreaterThan(120);
});

test('host hand-off keeps the heartbeat source alive', async ({ browser }) => {
  const host = await openMember(browser, 'Host');
  const guest = await openMember(browser, 'Guest', await roomOf(host));
  await host.locator('#makeHost').click();
  await expect(guest.locator('#role')).toHaveText('host');
  await expect(host.locator('#role')).toHaveText('guest');
  await play(guest);
  await expect.poll(async () => (await state(host)).paused).toBe(false);
  await host.evaluate(
    () => ((document.getElementById('video') as HTMLVideoElement).playbackRate = 0.8),
  );
  await host.waitForTimeout(5_000);
  await expectInSync(host, guest, 0.6);
});

test('a synchronised countdown starts everyone together', async ({ browser }) => {
  const host = await openMember(browser, 'Host');
  const guest = await openMember(browser, 'Guest', await roomOf(host));
  await seek(host, 60);
  await expectInSync(host, guest, 0.3);
  await host.locator('#countdown').click();
  await guest.waitForTimeout(1_000);
  expect((await state(guest)).paused).toBe(true);
  await expect.poll(async () => (await state(guest)).paused, { timeout: 6_000 }).toBe(false);
  await expect.poll(async () => (await state(host)).paused, { timeout: 6_000 }).toBe(false);
  await expectInSync(host, guest, 0.5);
});
