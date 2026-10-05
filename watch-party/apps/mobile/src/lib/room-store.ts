/**
 * Bridges the shared RoomSyncClient into React via useSyncExternalStore.
 * One store (one socket) lives for as long as the user is inside a room,
 * shared by the lobby and the watch screen.
 */
import {
  RoomRequestError,
  RoomSyncClient,
  type ProtocolError,
  type RelayedSyncAction,
  type RoomState,
  type ScheduledStartLocal,
} from '@watch-party/shared/client';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from './config';
import type { Profile } from './profile-model';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface RoomSnapshot {
  connection: ConnectionState;
  joined: boolean;
  state: RoomState | null;
  error: ProtocolError | null;
  drift: number | null;
  scheduled: ScheduledStartLocal | null;
  lastRemoteAction: RelayedSyncAction | null;
  autoplayBlocked: boolean;
}

const initial: RoomSnapshot = {
  connection: 'connecting',
  joined: false,
  state: null,
  error: null,
  drift: null,
  scheduled: null,
  lastRemoteAction: null,
  autoplayBlocked: false,
};

export class RoomStore {
  readonly client: RoomSyncClient;
  private readonly socket: Socket;
  private snapshot: RoomSnapshot = initial;
  private listeners = new Set<() => void>();
  private disposed = false;

  constructor(roomId: string, session: { userId: string; token: string }, profile: Profile) {
    this.socket = io(API_URL, {
      auth: { token: session.token },
      transports: ['websocket'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
    });
    this.client = new RoomSyncClient({
      socket: this.socket,
      roomId,
      userId: session.userId,
      profile: { country: profile.country, services: profile.services, displayName: profile.displayName },
    });

    this.client.on('state', (state) => this.set({ state }));
    this.client.on('drift', (drift) => this.set({ drift }));
    this.client.on('error', (error) => this.set({ error }));
    this.client.on('scheduled', (scheduled) => this.set({ scheduled }));
    this.client.on('remoteAction', (lastRemoteAction) => this.set({ lastRemoteAction, autoplayBlocked: false }));
    this.client.on('autoplayBlocked', () => this.set({ autoplayBlocked: true }));
    this.client.on('connection', (c) => this.set({ connection: c === 'connected' ? 'connected' : 'reconnecting' }));
    this.socket.on('connect_error', (err) => {
      this.set({
        connection: this.snapshot.joined ? 'reconnecting' : 'failed',
        error: { code: err.message === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'INTERNAL', message: `Connection failed: ${err.message}` },
      });
    });
    this.socket.once('connect', () => void this.firstJoin());
  }

  private async firstJoin(): Promise<void> {
    try {
      await this.client.join();
      this.set({ joined: true, connection: 'connected', error: null });
    } catch (err) {
      this.set({
        connection: 'failed',
        error: {
          code: err instanceof RoomRequestError ? err.code : 'INTERNAL',
          message: err instanceof Error ? err.message : 'Could not join the room',
        },
      });
    }
  }

  private set(patch: Partial<RoomSnapshot>): void {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): RoomSnapshot => this.snapshot;

  clearError(): void {
    this.set({ error: null });
  }

  clearScheduled(): void {
    this.set({ scheduled: null });
  }

  dismissAutoplayBlocked(): void {
    this.set({ autoplayBlocked: false });
  }

  /** Leave the room on purpose (vs. unmount): frees the seat immediately. */
  leave(): void {
    this.client.leave();
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.client.dispose();
    this.socket.disconnect();
    this.disposed = true;
    this.listeners.clear();
  }
}
