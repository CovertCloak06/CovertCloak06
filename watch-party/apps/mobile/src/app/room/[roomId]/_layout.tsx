import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { normalizeRoomCode } from '@/lib/room-code';
import { RoomProvider } from '@/lib/room-context';
import { useApp } from '@/lib/app-context';
import { usePalette } from '@/lib/theme';

/** Holds one socket + RoomSyncClient for the lobby and the watch screen. */
export default function RoomLayout() {
  const c = usePalette();
  const { roomId: raw } = useLocalSearchParams<{ roomId: string }>();
  const { ready, session, profile } = useApp();
  const roomId = normalizeRoomCode(raw ?? '');
  if (!ready) return null;
  if (!profile) return <Redirect href="/profile" />;
  if (!session || !roomId) return <Redirect href="/" />;
  return (
    <RoomProvider roomId={roomId} session={session} profile={profile}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: `Room ${roomId}` }} />
        <Stack.Screen name="watch" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </RoomProvider>
  );
}
