/**
 * Loads the built (dev) extension into Chromium and syncs a plain video page
 * driven by the extension with a dev-harness member (which stands in for the
 * mobile app: same injected controller and room client).
 */
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION = resolve(dirname(fileURLToPath(import.meta.url)), '../build');

let context: BrowserContext;
let worker: Worker;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium', // new headless mode, which supports extensions
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
    ],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
});

test.afterAll(async () => {
  await context?.close();
});

const video = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector('video')!;
    return { t: v.currentTime, paused: v.paused };
  });

async function waitForMetadata(page: Page) {
  await page.evaluate(() => {
    const v = document.querySelector('video')!;
    return v.readyState >= 1
      ? null
      : new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
  });
}

test('the extension syncs a tab with a harness member in both directions', async ({ baseURL }) => {
  await worker.evaluate(
    async ({ server }) => {
      await chrome.storage.local.set({
        serverUrl: server,
        profile: { displayName: 'Desktop Dana', country: 'GB', services: ['netflix', 'prime'] },
      });
    },
    { server: baseURL! },
  );

  const extPage = await context.newPage();
  await extPage.goto('/dev/plain.html');
  await waitForMetadata(extPage);
  const tabId = await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url === url)!.id!;
  }, extPage.url());

  const created = await worker.evaluate(
    (id) =>
      (
        globalThis as unknown as { watchParty: { handle(r: unknown): Promise<{ roomId: string }> } }
      ).watchParty.handle({ type: 'createRoom', tabId: id }),
    tabId,
  );
  expect(created.roomId).toMatch(/^[A-Z2-9]{6}$/);

  const harness = await context.newPage();
  await harness.goto(`/dev/?room=${created.roomId}&name=Mobile%20Max`);
  await expect(harness.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(harness.locator('#members li')).toHaveCount(2);
  await waitForMetadata(harness);

  // Desktop (extension) presses play: the harness member follows.
  await extPage.evaluate(() => document.querySelector('video')!.play());
  await expect.poll(async () => (await video(harness)).paused).toBe(false);

  // Harness member pauses: the extension tab follows, on the same frame.
  await harness.waitForTimeout(1_500);
  await harness.evaluate(() => (document.getElementById('video') as HTMLVideoElement).pause());
  await expect.poll(async () => (await video(extPage)).paused).toBe(true);
  await expect
    .poll(async () => Math.abs((await video(extPage)).t - (await video(harness)).t))
    .toBeLessThan(0.3);

  // Seek from the extension side.
  await extPage.evaluate(() => (document.querySelector('video')!.currentTime = 240));
  await expect.poll(async () => (await video(harness)).t).toBeGreaterThan(239);

  // The popup shows the room for that tab.
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  await expect(popup.locator('.code')).toHaveText(created.roomId);
  await expect(popup.locator('ul.members li')).toHaveCount(2);
});
