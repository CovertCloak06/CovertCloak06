import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Profile } from './profile-model';
import { RoomStore, type RoomSnapshot } from './room-store';

const RoomContext = createContext<RoomStore | null>(null);

export function RoomProvider({
  roomId,
  session,
  profile,
  children,
}: {
  roomId: string;
  session: { userId: string; token: string };
  profile: Profile;
  children: ReactNode;
}) {
  const [store, setStore] = useState<RoomStore | null>(null);
  useEffect(() => {
    const s = new RoomStore(roomId, session, profile);
    setStore(s);
    return () => s.dispose();
    // A profile edit mid-room takes effect on the next join, not by reconnecting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, session.token]);
  if (!store) return null;
  return <RoomContext.Provider value={store}>{children}</RoomContext.Provider>;
}

export function useRoomStore(): RoomStore {
  const store = useContext(RoomContext);
  if (!store) throw new Error('useRoomStore must be used inside <RoomProvider>');
  return store;
}

export function useRoom(): RoomSnapshot {
  const store = useRoomStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
