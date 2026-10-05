import { describe, expect, it } from 'vitest';
import { parsePlayerCommand, parsePlayerEvent, wrapPlayerMessage } from '../src/player/messages.js';
import { buildCommandInjection, buildPlayerInjection, createNonce } from '../src/player/host.js';

const nonce = 'abc123';

describe('player messages', () => {
  it('round-trips events with the right nonce', () => {
    const msg = { type: 'PLAYER_EVENT', action: 'PAUSE', timecode: 12.5, at: 1 } as const;
    expect(parsePlayerEvent(JSON.stringify(wrapPlayerMessage(nonce, msg)), nonce)).toEqual(msg);
  });
  it('rejects wrong nonces, bad shapes and oversized payloads', () => {
    const msg = { type: 'PLAYER_EVENT', action: 'PAUSE', timecode: 12.5, at: 1 };
    expect(parsePlayerEvent(JSON.stringify(wrapPlayerMessage('other', msg)), nonce)).toBeNull();
    expect(
      parsePlayerEvent(wrapPlayerMessage(nonce, { ...msg, action: 'EXPLODE' }), nonce),
    ).toBeNull();
    expect(parsePlayerEvent(wrapPlayerMessage(nonce, { ...msg, timecode: -1 }), nonce)).toBeNull();
    expect(parsePlayerEvent('x'.repeat(20_000), nonce)).toBeNull();
    expect(parsePlayerEvent('{not json', nonce)).toBeNull();
    expect(parsePlayerEvent(wrapPlayerMessage('', msg), '')).toBeNull();
  });
  it('strips unknown fields from commands', () => {
    const cmd = parsePlayerCommand(
      wrapPlayerMessage(nonce, { type: 'APPLY', action: 'PLAY', timecode: 1, asOf: 2, evil: 'x' }),
      nonce,
    );
    expect(cmd).toEqual({ type: 'APPLY', action: 'PLAY', timecode: 1, asOf: 2 });
  });
});

describe('injection builders', () => {
  it('embeds config and the bundled controller', () => {
    const script = buildPlayerInjection({ nonce, adapter: 'netflix' });
    expect(script).toContain('"nonce":"abc123"');
    expect(script).toContain('"adapter":"netflix"');
    expect(script.endsWith('true;')).toBe(true);
  });
  it('encodes commands as a string literal, not code', () => {
    const script = buildCommandInjection(nonce, { type: 'REQUEST_STATUS' });
    expect(script).toMatch(/^window\.__watchParty&&window\.__watchParty\.receive\("/);
  });
  it('creates random hex nonces', () => {
    const a = createNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(createNonce()).not.toBe(a);
  });
});
