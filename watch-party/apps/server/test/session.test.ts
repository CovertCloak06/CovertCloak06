import { describe, expect, it } from 'vitest';
import { bearerToken, SessionSigner } from '../src/auth/session.js';
import { ConfigError, loadConfig } from '../src/config.js';

describe('SessionSigner', () => {
  const signer = new SessionSigner('s'.repeat(40), 60_000);

  it('issues tokens that verify to the same user', () => {
    const s = signer.issue(1_000);
    expect(signer.verify(s.token, 2_000)).toEqual({ userId: s.userId, expiresAt: 61_000 });
  });

  it('rejects tampered, foreign, expired and malformed tokens', () => {
    const s = signer.issue(1_000);
    const [v, , exp, mac] = s.token.split('.');
    expect(signer.verify(`${v}.u_AAAAAAAAAAAAAAAA.${exp}.${mac}`, 2_000)).toBeNull();
    expect(signer.verify(`${v}.${s.userId}.${Number(exp) + 1}.${mac}`, 2_000)).toBeNull();
    expect(new SessionSigner('t'.repeat(40), 60_000).verify(s.token, 2_000)).toBeNull();
    expect(signer.verify(s.token, 61_000)).toBeNull();
    expect(signer.verify('nope', 2_000)).toBeNull();
    expect(signer.verify(undefined, 2_000)).toBeNull();
    expect(signer.verify('a'.repeat(1_000), 2_000)).toBeNull();
  });

  it('parses bearer headers', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});

describe('loadConfig', () => {
  it('picks the provider automatically from available credentials', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).catalog.provider).toBe('fixture');
    expect(loadConfig({ NODE_ENV: 'test', TMDB_READ_TOKEN: 't' }).catalog.provider).toBe('tmdb');
    expect(
      loadConfig({ NODE_ENV: 'test', TMDB_READ_TOKEN: 't', STREAMING_AVAILABILITY_API_KEY: 'k' }).catalog.provider,
    ).toBe('streaming-availability');
  });

  it('refuses unsafe production setups', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', TMDB_READ_TOKEN: 't' })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40) })).toThrow(/catalog API/);
    expect(
      loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), ALLOW_FIXTURE_CATALOG: '1' }).catalog.provider,
    ).toBe('fixture');
  });

  it('requires credentials for an explicitly chosen provider', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', CATALOG_PROVIDER: 'tmdb' })).toThrow(ConfigError);
  });

  it('defaults catalog TTL inside the 12-24h window', () => {
    const ttl = loadConfig({ NODE_ENV: 'test' }).catalog.ttlMs / 3_600_000;
    expect(ttl).toBeGreaterThanOrEqual(12);
    expect(ttl).toBeLessThanOrEqual(24);
  });
});
