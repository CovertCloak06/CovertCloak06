import { getService, type WatchOption } from '@watch-party/shared/client';
import { describe, expect, it } from 'vitest';
import { countdownSeconds, formatDrift, formatRuntime, formatTimecode } from '../src/lib/format.js';
import {
  adapterFor,
  decideNavigation,
  initialPlaybackMode,
  preferredOption,
} from '../src/lib/navigation.js';
import {
  parseStoredProfile,
  reconcileServices,
  validateProfile,
} from '../src/lib/profile-model.js';
import { normalizeRoomCode, shareLink } from '../src/lib/room-code.js';

const netflix = getService('netflix')!;
const apple = getService('apple')!;

describe('decideNavigation', () => {
  it('keeps top-level navigation on the chosen service', () => {
    expect(decideNavigation('https://www.netflix.com/watch/1', true, netflix)).toBe('allow');
    expect(decideNavigation('https://help.netflix.com/', true, netflix)).toBe('allow');
    expect(decideNavigation('https://example.com/', true, netflix)).toBe('external');
    expect(decideNavigation('https://evil-netflix.com/', true, netflix)).toBe('external');
  });
  it('allows the service sign-in domains', () => {
    expect(decideNavigation('https://idmsa.apple.com/signin', true, apple)).toBe('allow');
    expect(decideNavigation('https://idmsa.apple.com/signin', true, netflix)).toBe('external');
  });
  it('allows https sub-frames but blocks insecure or odd schemes', () => {
    expect(decideNavigation('https://license.example-drm.com/', false, netflix)).toBe('allow');
    expect(decideNavigation('http://www.netflix.com/', true, netflix)).toBe('block');
    expect(decideNavigation('javascript:alert(1)', true, netflix)).toBe('block');
    expect(decideNavigation('about:blank', false, netflix)).toBe('allow');
    expect(decideNavigation('about:blank', true, netflix)).toBe('block');
    expect(decideNavigation('not a url', true, netflix)).toBe('block');
  });
});

describe('playback mode', () => {
  const option = (
    serviceId: string,
    mobileWeb: WatchOption['mobileWeb'],
    directLink = true,
  ): WatchOption => ({
    serviceId,
    serviceName: serviceId,
    countryCode: 'US',
    webUrl: 'https://x',
    nativeUrl: 'https://x',
    directLink,
    mobileWeb,
  });
  it('goes native for services that refuse mobile web playback', () => {
    expect(initialPlaybackMode(option('netflix', 'unsupported'))).toBe('native');
    expect(initialPlaybackMode(option('prime', 'limited'))).toBe('webview');
  });
  it('prefers options that play in the WebView, then direct links', () => {
    expect(
      preferredOption([option('netflix', 'unsupported'), option('max', 'limited')])?.serviceId,
    ).toBe('max');
    expect(
      preferredOption([option('a', 'limited', false), option('b', 'limited', true)])?.serviceId,
    ).toBe('b');
    expect(preferredOption([])).toBeNull();
  });
  it('maps services to player adapters', () => {
    expect(adapterFor('netflix')).toBe('netflix');
    expect(adapterFor('prime')).toBe('generic');
    expect(adapterFor('unknown')).toBe('generic');
  });
});

describe('format', () => {
  it('formats timecodes', () => {
    expect(formatTimecode(3725.4)).toBe('1:02:05');
    expect(formatTimecode(65)).toBe('1:05');
    expect(formatTimecode(null)).toBe('–:––');
  });
  it('formats drift and runtime', () => {
    expect(formatDrift(0.12)).toBe('+120 ms');
    expect(formatDrift(-1.43)).toBe('−1.4 s');
    expect(formatDrift(null)).toBe('–');
    expect(formatRuntime(135)).toBe('2h 15m');
    expect(formatRuntime(null)).toBeNull();
  });
  it('counts down in whole seconds', () => {
    expect(countdownSeconds(10_000, 7_100)).toBe(3);
    expect(countdownSeconds(10_000, 12_000)).toBe(0);
  });
});

describe('profile', () => {
  it('validates names, countries and regional services', () => {
    expect(
      validateProfile({ displayName: 'Ana', country: 'US', services: ['netflix', 'hulu'] }),
    ).toEqual({});
    expect(validateProfile({ displayName: ' ', country: 'XX', services: [] })).toMatchObject({
      displayName: expect.any(String),
      country: expect.any(String),
      services: expect.any(String),
    });
    expect(
      validateProfile({ displayName: 'Ben', country: 'GB', services: ['hulu'] }).services,
    ).toMatch(/not sold/);
  });
  it('drops services that are not sold after a country change', () => {
    expect(reconcileServices('GB', ['netflix', 'hulu', 'now'])).toEqual(['netflix', 'now']);
  });
  it('parses stored profiles defensively', () => {
    expect(
      parseStoredProfile('{"displayName":"Ana","country":"US","services":["netflix"]}'),
    ).toEqual({
      displayName: 'Ana',
      country: 'US',
      services: ['netflix'],
    });
    expect(parseStoredProfile('{bad json')).toBeNull();
    expect(parseStoredProfile('{"displayName":1}')).toBeNull();
    expect(parseStoredProfile(null)).toBeNull();
  });
});

describe('room codes', () => {
  it('accepts codes in any case, with spacing, or inside a share link', () => {
    expect(normalizeRoomCode('abc-dez')).toBe('ABCDEZ');
    expect(normalizeRoomCode(' ab cd ez ')).toBe('ABCDEZ');
    expect(normalizeRoomCode(shareLink('XEZ3GM'))).toBe('XEZ3GM');
  });
  it('rejects wrong lengths and characters codes never contain', () => {
    expect(normalizeRoomCode('ABC')).toBeNull();
    expect(normalizeRoomCode('ABCDE0')).toBeNull();
    expect(normalizeRoomCode('ABCDEI')).toBeNull();
  });
});
