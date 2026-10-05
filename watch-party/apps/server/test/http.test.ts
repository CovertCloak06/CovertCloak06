import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixtureCatalogProvider } from '../src/catalog/providers/fixture.js';
import { newSession, startApp, type RunningApp } from './helpers.js';

let running: RunningApp;
let token: string;

beforeAll(async () => {
  running = await startApp({ provider: new FixtureCatalogProvider(), metadata: null });
  token = (await newSession(running.url)).token;
});
afterAll(() => running.close());

const auth = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

describe('HTTP API', () => {
  it('serves health, readiness and metadata', async () => {
    expect(await (await fetch(`${running.url}/healthz`)).json()).toEqual({ ok: true });
    expect(await (await fetch(`${running.url}/readyz`)).json()).toMatchObject({ ok: true, store: 'memory', provider: 'fixture' });
    const meta = (await (await fetch(`${running.url}/api/meta?country=GB`)).json()) as { services: Array<{ id: string }> };
    expect(meta.services.map((s) => s.id)).toContain('now');
    expect(meta.services.map((s) => s.id)).not.toContain('hulu');
  });

  it('requires a session for catalog and room endpoints', async () => {
    expect((await fetch(`${running.url}/api/rooms`, { method: 'POST' })).status).toBe(401);
    const res = await fetch(`${running.url}/api/catalog/common`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(401);
  });

  it('computes common titles and validates input', async () => {
    const ok = await fetch(`${running.url}/api/catalog/common`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        users: [
          { userId: 'a', countryCode: 'US', services: ['netflix', 'max'] },
          { userId: 'b', countryCode: 'UK', services: ['prime', 'netflix'] },
        ],
        pageSize: 5,
      }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { results: unknown[]; provider: string; totalResults: number };
    expect(body.provider).toBe('fixture');
    expect(body.results.length).toBeGreaterThan(0);

    const bad = await fetch(`${running.url}/api/catalog/common`, { method: 'POST', headers: auth(), body: JSON.stringify({ users: [] }) });
    expect(bad.status).toBe(400);
    const unknown = await fetch(`${running.url}/api/catalog/common`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ users: [{ userId: 'a', countryCode: 'US', services: ['betamax'] }] }),
    });
    expect(unknown.status).toBe(400);
    const malformed = await fetch(`${running.url}/api/catalog/common`, { method: 'POST', headers: auth(), body: '{oops' });
    expect(malformed.status).toBe(400);
  });

  it('creates rooms and hides details from non-members', async () => {
    const created = await fetch(`${running.url}/api/rooms`, { method: 'POST', headers: auth() });
    expect(created.status).toBe(201);
    const { roomId } = (await created.json()) as { roomId: string };
    expect(roomId).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const other = await newSession(running.url);
    const view = await fetch(`${running.url}/api/rooms/${roomId}`, { headers: { authorization: `Bearer ${other.token}` } });
    expect(await view.json()).toEqual({ roomId, memberCount: 0, maxMembers: 8 });
    const catalog = await fetch(`${running.url}/api/rooms/${roomId}/catalog`, { headers: { authorization: `Bearer ${other.token}` } });
    expect(catalog.status).toBe(403);
    expect((await fetch(`${running.url}/api/rooms/ZZZZZZ`, { headers: auth() })).status).toBe(404);
  });
});
