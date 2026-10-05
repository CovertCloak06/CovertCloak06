import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/lib/app-context';
import { usePalette } from '@/lib/theme';

export default function RootLayout() {
  const c = usePalette();
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Watch Party' }} />
          <Stack.Screen name="profile" options={{ title: 'Your streaming setup', presentation: 'modal' }} />
          <Stack.Screen name="room/[roomId]" options={{ headerShown: false }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
