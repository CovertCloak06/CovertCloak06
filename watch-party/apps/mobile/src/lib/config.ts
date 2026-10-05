import Constants from 'expo-constants';

/**
 * Base URL of the watch party server. `EXPO_PUBLIC_API_URL` (inlined at build
 * time) wins over `extra.apiUrl` in app.json. On a physical device,
 * `localhost` is the phone itself: use the dev machine's LAN address.
 */
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:8080'
).replace(/\/+$/, '');
