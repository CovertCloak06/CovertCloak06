import { describe, expect, it } from 'vitest';
import { RoomService } from '../src/rooms/room-service.js';
import { MemoryStore } from '../src/store/memory.js';

const join = (svc: RoomService, roomId: string, userId: string) =>
  svc.join(roomId, { userId, displayName: userId, countryCode: 'US', services: ['netflix'] });

describe('RoomService', () => {
  it('prunes long-disconnected members and re-elects the host even if grace timers were lost', async () => {
    let now = 1_000_000;
    const svc = new RoomService(new MemoryStore(() => now), { now: () => now, staleMemberMs: 60_000 });
    const roomId = await svc.create('u_host');
    await join(svc, roomId, 'u_host');
    now += 10;
    await join(svc, roomId, 'u_guest');
    await svc.markDisconnected(roomId, 'u_host');
    // An instance crash means no timer ever removes the host; a minute later
    // any update to the room cleans up.
    now += 61_000;
    const state = await svc.setMemberStatus(roomId, 'u_guest', 'playing', 10);
    expect(state.state.members.map((m) => m.userId)).toEqual(['u_guest']);
    expect(state.state.hostId).toBe('u_guest');
  });

  it('makes the first joiner host when the creator never joins', async () => {
    const svc = new RoomService(new MemoryStore());
    const roomId = await svc.create('u_creator');
    expect((await join(svc, roomId, 'u_first')).hostId).toBe('u_first');
  });

  it('materialises a scheduled start once its moment passes', async () => {
    let now = 5_000_000;
    const svc = new RoomService(new MemoryStore(() => now), { now: () => now });
    const roomId = await svc.create('u_h');
    await join(svc, roomId, 'u_h');
    await svc.scheduleStart(roomId, 'u_h', 42, 5_000);
    expect((await svc.get(roomId))!.playback).toMatchObject({ paused: true, timecode: 42 });
    now += 5_000;
    const s = (await svc.get(roomId))!;
    expect(s.scheduledStart).toBeNull();
    expect(s.playback).toMatchObject({ paused: false, timecode: 42, timestamp: 5_005_000 });
  });

  it('ignores heartbeats from non-hosts and during a countdown', async () => {
    const svc = new RoomService(new MemoryStore());
    const roomId = await svc.create('u_h');
    await join(svc, roomId, 'u_h');
    await join(svc, roomId, 'u_g');
    const beat = { timecode: 10, paused: false, playbackRate: 1, timestamp: Date.now() };
    expect((await svc.applyHeartbeat(roomId, 'u_g', beat)).accepted).toBe(false);
    expect((await svc.applyHeartbeat(roomId, 'u_h', beat)).accepted).toBe(true);
    await svc.scheduleStart(roomId, 'u_h', 0, 10_000);
    expect((await svc.applyHeartbeat(roomId, 'u_h', beat)).accepted).toBe(false);
  });
});
