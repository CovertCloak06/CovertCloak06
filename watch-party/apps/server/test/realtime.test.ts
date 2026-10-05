import {
  RoomSyncClient,
  type Ack,
  type PlayerCommand,
  type RelayedHeartbeat,
  type RelayedSyncAction,
  type RoomState,
  type ScheduledStart,
  type TitleSelection,
} from '@watch-party/shared';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixtureCatalogProvider } from '../src/catalog/providers/fixture.js';
import {
  connectSocket,
  createRoom,
  emitAck,
  newSession,
  nextEvent,
  noEvent,
  sleep,
  startApp,
  type RunningApp,
} from './helpers.js';

let running: RunningApp;
const sockets: Socket[] = [];

beforeEach(async () => {
  running = await startApp({ provider: new FixtureCatalogProvider(), metadata: null });
});
afterEach(async () => {
  for (const s of sockets.splice(0)) s.disconnect();
  await running.close();
});

async function member(name: string, country = 'US', services = ['netflix']) {
  const session = await newSession(running.url);
  const socket = await connectSocket(running.url, session.token);
  sockets.push(socket);
  return { ...session, socket, name, country, services };
}

async function join(m: Awaited<ReturnType<typeof member>>, roomId: string) {
  const ack = await emitAck<Ack<RoomState>>(m.socket, 'JOIN_ROOM', {
    roomId,
    country: m.country,
    services: m.services,
    displayName: m.name,
  });
  if (!ack.ok) throw new Error(ack.error.message);
  return ack.data;
}

async function roomWith(n: number) {
  const people = await Promise.all(
    Array.from({ length: n }, (_, i) =>
      member(`P${i}`, i % 2 ? 'GB' : 'US', i % 2 ? ['prime', 'netflix'] : ['netflix']),
    ),
  );
  const roomId = await createRoom(running.url, people[0]!.token);
  for (const p of people) await join(p, roomId);
  return { roomId, people };
}

describe('authentication', () => {
  it('rejects sockets without a valid session token', async () => {
    await expect(connectSocket(running.url, undefined)).rejects.toThrow('UNAUTHORIZED');
    await expect(connectSocket(running.url, 'v1.u_fake.9999999999999.sig')).rejects.toThrow(
      'UNAUTHORIZED',
    );
  });
});

describe('rooms', () => {
  it('joins with normalised country, makes the creator host and broadcasts membership', async () => {
    const a = await member('Ana', 'US');
    const b = await member('Ben', 'uk', ['prime']);
    const roomId = await createRoom(running.url, a.token);
    const s1 = await join(a, roomId);
    expect(s1.hostId).toBe(a.userId);
    const seen = nextEvent<RoomState>(a.socket, 'ROOM_STATE', 3_000, (s) => s.members.length === 2);
    const s2 = await join(b, roomId);
    expect(s2.members.find((m) => m.userId === b.userId)).toMatchObject({
      countryCode: 'GB',
      services: ['prime'],
    });
    expect((await seen).members.map((m) => m.displayName)).toEqual(['Ana', 'Ben']);
  });

  it('rejects unknown rooms, bad payloads, spoofed user ids and unknown services', async () => {
    const a = await member('Ana');
    const roomId = await createRoom(running.url, a.token);
    expect(
      await emitAck(a.socket, 'JOIN_ROOM', {
        roomId: 'NOPE99',
        country: 'US',
        services: ['netflix'],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
    expect(await emitAck(a.socket, 'JOIN_ROOM', { roomId })).toMatchObject({
      ok: false,
      error: { code: 'BAD_REQUEST' },
    });
    expect(
      await emitAck(a.socket, 'JOIN_ROOM', {
        roomId,
        userId: 'u_someoneElse1',
        country: 'US',
        services: ['netflix'],
      }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(
      await emitAck(a.socket, 'JOIN_ROOM', { roomId, country: 'US', services: ['vhs'] }),
    ).toMatchObject({
      ok: false,
      error: { code: 'BAD_REQUEST' },
    });
  });

  it('enforces the room size limit', async () => {
    const { roomId } = await roomWith(8);
    const late = await member('Late');
    expect(
      await emitAck(late.socket, 'JOIN_ROOM', { roomId, country: 'US', services: ['netflix'] }),
    ).toMatchObject({
      ok: false,
      error: { code: 'ROOM_FULL' },
    });
  });

  it('requires joining before sending room events', async () => {
    const a = await member('Ana');
    const roomId = await createRoom(running.url, a.token);
    expect(
      await emitAck(a.socket, 'SYNC_ACTION', {
        roomId,
        action: 'PLAY',
        timecode: 1,
        timestamp: Date.now(),
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
  });
});

describe('sync actions', () => {
  it('relays actions to everyone but the sender, stamping the authenticated sender', async () => {
    const { roomId, people } = await roomWith(3);
    const [a, b, c] = people as [(typeof people)[0], (typeof people)[0], (typeof people)[0]];
    const atB = nextEvent<RelayedSyncAction>(b.socket, 'SYNC_ACTION');
    const atC = nextEvent<RelayedSyncAction>(c.socket, 'SYNC_ACTION');
    const ts = Date.now() - 50;
    const ack = await emitAck(a.socket, 'SYNC_ACTION', {
      roomId,
      senderId: b.userId, // spoof attempt
      action: 'PAUSE',
      timecode: 1243.52,
      timestamp: ts,
    });
    expect(ack).toEqual({ ok: true, data: null });
    const relayed = await atB;
    expect(relayed).toMatchObject({
      roomId,
      senderId: a.userId,
      action: 'PAUSE',
      timecode: 1243.52,
      timestamp: ts,
    });
    expect((await atC).senderId).toBe(a.userId);
    await noEvent(a.socket, 'SYNC_ACTION');
  });

  it('replaces implausible client timestamps with server time', async () => {
    const { roomId, people } = await roomWith(2);
    const at = nextEvent<RelayedSyncAction>(people[1]!.socket, 'SYNC_ACTION');
    const before = Date.now();
    await emitAck(people[0]!.socket, 'SYNC_ACTION', {
      roomId,
      action: 'PLAY',
      timecode: 5,
      timestamp: 1_000,
    });
    expect((await at).timestamp).toBeGreaterThanOrEqual(before);
  });

  it('enforces host-only control when enabled', async () => {
    const { roomId, people } = await roomWith(2);
    const [host, guest] = people as [(typeof people)[0], (typeof people)[0]];
    expect(
      await emitAck(guest.socket, 'UPDATE_SETTINGS', { roomId, hostOnlyControl: true }),
    ).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(
      await emitAck(host.socket, 'UPDATE_SETTINGS', { roomId, hostOnlyControl: true }),
    ).toEqual({ ok: true, data: null });
    expect(
      await emitAck(guest.socket, 'SYNC_ACTION', {
        roomId,
        action: 'PLAY',
        timecode: 1,
        timestamp: Date.now(),
      }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(
      await emitAck(host.socket, 'SYNC_ACTION', {
        roomId,
        action: 'PLAY',
        timecode: 1,
        timestamp: Date.now(),
      }),
    ).toEqual({ ok: true, data: null });
  });

  it('only relays heartbeats from the host (host primacy)', async () => {
    const { roomId, people } = await roomWith(2);
    const [host, guest] = people as [(typeof people)[0], (typeof people)[0]];
    guest.socket.emit('HOST_HEARTBEAT', {
      roomId,
      timecode: 99,
      paused: false,
      playbackRate: 1,
      timestamp: Date.now(),
    });
    await noEvent(host.socket, 'SYNC_HEARTBEAT');
    const beat = nextEvent<RelayedHeartbeat>(guest.socket, 'SYNC_HEARTBEAT');
    host.socket.emit('HOST_HEARTBEAT', {
      roomId,
      timecode: 42,
      paused: false,
      playbackRate: 1,
      timestamp: Date.now(),
    });
    expect(await beat).toMatchObject({ senderId: host.userId, timecode: 42, paused: false });
  });

  it('rate limits floods of sync actions', async () => {
    const { roomId, people } = await roomWith(1);
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        emitAck<Ack<null>>(people[0]!.socket, 'SYNC_ACTION', {
          roomId,
          action: 'SEEK',
          timecode: i,
          timestamp: Date.now(),
        }),
      ),
    );
    expect(results.filter((r) => !r.ok && r.error.code === 'RATE_LIMITED').length).toBeGreaterThan(
      0,
    );
  });

  it('answers clock pings with server time', async () => {
    const a = await member('Ana');
    const pong = await emitAck<{ t0: number; serverTime: number }>(a.socket, 'TIME_PING', {
      t0: 123,
    });
    expect(pong.t0).toBe(123);
    expect(Math.abs(pong.serverTime - Date.now())).toBeLessThan(1_000);
  });
});

describe('host lifecycle', () => {
  it('keeps the host seat through a short disconnect, then promotes the longest-standing member', async () => {
    const { people } = await roomWith(3);
    const [host, second, third] = people as [
      (typeof people)[0],
      (typeof people)[0],
      (typeof people)[0],
    ];
    const offline = nextEvent<RoomState>(second.socket, 'ROOM_STATE', 3_000, (s) =>
      s.members.some((m) => m.userId === host.userId && !m.connected),
    );
    host.socket.disconnect();
    const s = await offline;
    expect(s.hostId).toBe(host.userId);
    const promoted = await nextEvent<RoomState>(
      third.socket,
      'ROOM_STATE',
      3_000,
      (st) => st.hostId !== host.userId,
    );
    expect(promoted.hostId).toBe(second.userId);
    expect(promoted.members.map((m) => m.userId)).not.toContain(host.userId);
  });

  it('restores a member who reconnects within the grace period', async () => {
    const { roomId, people } = await roomWith(2);
    const [host, guest] = people as [(typeof people)[0], (typeof people)[0]];
    host.socket.disconnect();
    await sleep(100);
    const back = await connectSocket(running.url, host.token);
    sockets.push(back);
    const state = (await emitAck<Ack<RoomState>>(back, 'JOIN_ROOM', {
      roomId,
      country: 'US',
      services: ['netflix'],
    })) as {
      ok: true;
      data: RoomState;
    };
    expect(state.data.hostId).toBe(host.userId);
    await sleep(500); // past the 300ms test grace period
    const current = await emitAck<Ack<RoomState>>(guest.socket, 'JOIN_ROOM', {
      roomId,
      country: 'GB',
      services: ['prime'],
    });
    expect(current.ok && current.data.hostId).toBe(host.userId);
    expect(
      current.ok && current.data.members.find((m) => m.userId === host.userId)?.connected,
    ).toBe(true);
  });

  it('survives a reconnect that races the disconnect handler', async () => {
    const { roomId, people } = await roomWith(2);
    const [host, guest] = people as [(typeof people)[0], (typeof people)[0]];
    // Hold the "mark offline" write until the user has already rejoined, which
    // is the interleaving a flaky mobile network produces.
    const rooms = running.app.rooms;
    const original = rooms.markDisconnected.bind(rooms);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    rooms.markDisconnected = async (r: string, u: string) => {
      await gate;
      return original(r, u);
    };
    host.socket.disconnect();
    await sleep(50);
    const back = await connectSocket(running.url, host.token);
    sockets.push(back);
    await emitAck(back, 'JOIN_ROOM', { roomId, country: 'US', services: ['netflix'] });
    release();
    await sleep(600); // past the 300ms test grace period
    rooms.markDisconnected = original;
    const state = (await rooms.get(roomId))!;
    const me = state.members.find((m) => m.userId === host.userId);
    expect(me?.connected).toBe(true);
    expect(state.hostId).toBe(host.userId);
    expect(state.members.map((m) => m.userId)).toContain(guest.userId);
  });

  it('transfers host on request and on leave', async () => {
    const { roomId, people } = await roomWith(2);
    const [host, guest] = people as [(typeof people)[0], (typeof people)[0]];
    expect(
      await emitAck(guest.socket, 'TRANSFER_HOST', { roomId, userId: guest.userId }),
    ).toMatchObject({ ok: false });
    const st = nextEvent<RoomState>(
      guest.socket,
      'ROOM_STATE',
      3_000,
      (s) => s.hostId === guest.userId,
    );
    await emitAck(host.socket, 'TRANSFER_HOST', { roomId, userId: guest.userId });
    await st;
    const back = nextEvent<RoomState>(
      host.socket,
      'ROOM_STATE',
      3_000,
      (s) => s.hostId === host.userId,
    );
    await emitAck(guest.socket, 'LEAVE_ROOM', { roomId });
    expect((await back).members).toHaveLength(1);
  });
});

describe('title selection and scheduled start', () => {
  it('lets the host pick a title and gives each member their own watch options', async () => {
    const { roomId, people } = await roomWith(2);
    const [host, guest] = people as [(typeof people)[0], (typeof people)[0]];
    const catalog = await fetch(`${running.url}/api/rooms/${roomId}/catalog?pageSize=1`, {
      headers: { authorization: `Bearer ${host.token}` },
    }).then((r) => r.json() as Promise<{ results: Array<{ tmdbId: number }> }>);
    const tmdbId = catalog.results[0]!.tmdbId;

    expect(await emitAck(guest.socket, 'SELECT_TITLE', { roomId, tmdbId })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    const atGuest = nextEvent<RoomState>(
      guest.socket,
      'ROOM_STATE',
      3_000,
      (s) => s.selection?.tmdbId === tmdbId,
    );
    const ack = await emitAck<Ack<TitleSelection>>(host.socket, 'SELECT_TITLE', { roomId, tmdbId });
    expect(ack.ok).toBe(true);
    const state = await atGuest;
    expect(state.selection!.watchOptions[host.userId]!.length).toBeGreaterThan(0);
    expect(state.selection!.watchOptions[guest.userId]!.every((o) => o.countryCode === 'GB')).toBe(
      true,
    );
    expect(state.playback).toMatchObject({ paused: true, timecode: 0 });

    // Someone joining after the pick gets their options computed too.
    const late = await member('Late', 'US', ['netflix']);
    const lateState = await join(late, roomId);
    expect(lateState.selection!.watchOptions[late.userId]).toBeDefined();
  });

  it('schedules a synchronised start that materialises into playback', async () => {
    const { roomId, people } = await roomWith(2);
    const [host, guest] = people as [(typeof people)[0], (typeof people)[0]];
    const scheduled = nextEvent<ScheduledStart>(guest.socket, 'START_SCHEDULED');
    const ack = await emitAck<Ack<ScheduledStart>>(host.socket, 'SCHEDULE_START', {
      roomId,
      timecode: 30,
      delayMs: 3_000,
    });
    expect(ack.ok).toBe(true);
    const start = await scheduled;
    expect(start.startAt - Date.now()).toBeGreaterThan(2_000);
    const state = await running.app.rooms.get(roomId);
    expect(state!.scheduledStart).not.toBeNull();
    expect(state!.playback.paused).toBe(true);
  });
});

describe('RoomSyncClient against the real server', () => {
  async function client(name: string, country: string, services: string[], roomId: string) {
    const m = await member(name, country, services);
    const commands: PlayerCommand[] = [];
    const c = new RoomSyncClient({
      socket: m.socket,
      roomId,
      userId: m.userId,
      profile: { country, services, displayName: name },
    });
    await c.join();
    c.attachPlayer({ send: (cmd) => commands.push(cmd) });
    return { m, c, commands };
  }

  it('turns a local pause into a remote APPLY with clock-corrected timing', async () => {
    const creator = await newSession(running.url);
    const roomId = await createRoom(running.url, creator.token);
    const a = await client('Ana', 'US', ['netflix'], roomId);
    const b = await client('Ben', 'GB', ['netflix'], roomId);
    expect(a.c.clock.isReliable).toBe(true);
    expect(Math.abs(a.c.clock.offsetMs)).toBeLessThan(50);

    a.c.handlePlayerEvent({
      type: 'PLAYER_EVENT',
      action: 'PAUSE',
      timecode: 600.5,
      at: Date.now(),
    });
    await sleep(200);
    const apply = b.commands.find((cmd) => cmd.type === 'APPLY');
    expect(apply).toMatchObject({ type: 'APPLY', action: 'PAUSE', timecode: 600.5 });
    expect(a.commands.some((cmd) => cmd.type === 'APPLY')).toBe(false);
    a.c.dispose();
    b.c.dispose();
  });

  it('streams host heartbeats into SYNC commands for guests and reports drift', async () => {
    const creator = await newSession(running.url);
    const roomId = await createRoom(running.url, creator.token);
    const host = await client('Host', 'US', ['netflix'], roomId);
    const guest = await client('Guest', 'GB', ['netflix'], roomId);
    expect(host.c.isHost).toBe(true);
    const drifts: Array<number | null> = [];
    guest.c.on('drift', (d) => drifts.push(d));
    guest.c.handlePlayerEvent({
      type: 'PLAYER_STATUS',
      timecode: 99.4,
      paused: false,
      buffering: false,
      playbackRate: 1,
      duration: 7200,
      at: Date.now(),
    });
    host.c.handlePlayerEvent({
      type: 'PLAYER_STATUS',
      timecode: 100,
      paused: false,
      buffering: false,
      playbackRate: 1,
      duration: 7200,
      at: Date.now(),
    });
    await sleep(200);
    const sync = guest.commands.find((cmd) => cmd.type === 'SYNC');
    expect(sync).toMatchObject({ type: 'SYNC', timecode: 100, paused: false });
    expect(drifts.at(-1)).toBeLessThan(-0.4);
    host.c.dispose();
    guest.c.dispose();
  });

  it('snaps a guest back instead of broadcasting in host-only rooms', async () => {
    const creator = await newSession(running.url);
    const roomId = await createRoom(running.url, creator.token);
    const host = await client('Host', 'US', ['netflix'], roomId);
    const guest = await client('Guest', 'US', ['netflix'], roomId);
    await host.c.setHostOnlyControl(true);
    await sleep(100);
    const errors: string[] = [];
    guest.c.on('error', (e) => errors.push(e.code));
    guest.commands.length = 0;
    guest.c.handlePlayerEvent({
      type: 'PLAYER_EVENT',
      action: 'SEEK',
      timecode: 3000,
      at: Date.now(),
    });
    await sleep(200);
    expect(errors).toContain('FORBIDDEN');
    expect(guest.commands.some((c) => c.type === 'SYNC')).toBe(true);
    expect(host.commands.some((c) => c.type === 'APPLY')).toBe(false);
    host.c.dispose();
    guest.c.dispose();
  });
});
