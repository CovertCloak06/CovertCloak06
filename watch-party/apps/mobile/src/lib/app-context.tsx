import type { SessionResponse } from '@watch-party/shared/client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Profile } from './profile-model';
import { loadOrCreateSession, loadProfile, saveProfile } from './storage';

interface AppContextValue {
  ready: boolean;
  session: SessionResponse | null;
  sessionError: string | null;
  profile: Profile | null;
  updateProfile(profile: Profile): Promise<void>;
  retrySession(): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    void loadProfile().then((p) => {
      setProfile(p);
      setProfileLoaded(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSessionError(null);
    loadOrCreateSession()
      .then((s) => !cancelled && setSession(s))
      .catch((err: unknown) => !cancelled && setSessionError(err instanceof Error ? err.message : 'Could not start a session'));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const updateProfile = useCallback(async (p: Profile) => {
    await saveProfile(p);
    setProfile(p);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ready: profileLoaded && (session !== null || sessionError !== null),
      session,
      sessionError,
      profile,
      updateProfile,
      retrySession: () => setAttempt((n) => n + 1),
    }),
    [profileLoaded, session, sessionError, profile, updateProfile],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
