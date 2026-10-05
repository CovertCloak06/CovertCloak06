/**
 * Device persistence.
 * - The session token is a credential for this app, so it lives in the OS
 *   keychain/keystore (expo-secure-store).
 * - The profile (name, country, services) is not secret: AsyncStorage.
 * Streaming-service logins never pass through here: they stay inside the
 * WebView's own cookie store (spec rule 3).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SessionResponse } from '@watch-party/shared/client';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import { parseStoredProfile, type Profile } from './profile-model';

const SESSION_KEY = 'watchparty.session.v1';
const PROFILE_KEY = 'watchparty.profile.v1';
/** Renew sessions this long before they expire. */
const RENEW_BEFORE_MS = 2 * 86_400_000;

export async function loadOrCreateSession(): Promise<SessionResponse> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY).catch(() => null);
  if (raw) {
    try {
      const s = JSON.parse(raw) as SessionResponse;
      if (s.token && s.userId && s.expiresAt - Date.now() > RENEW_BEFORE_MS) return s;
    } catch {
      // fall through and create a fresh session
    }
  }
  const fresh = await api.createSession();
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(fresh));
  return fresh;
}

export async function loadProfile(): Promise<Profile | null> {
  return parseStoredProfile(await AsyncStorage.getItem(PROFILE_KEY).catch(() => null));
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
