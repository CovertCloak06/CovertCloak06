import { countryFlag, getService } from '@watch-party/shared/client';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Banner, Body, Button, Card, Label, Screen, Title } from '@/components/ui';
import { api, ApiError, type RoomPreview } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { normalizeRoomCode } from '@/lib/room-code';
import { radius, space, usePalette } from '@/lib/theme';

export default function Home() {
  const c = usePalette();
  const { ready, session, sessionError, profile, retrySession } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </Screen>
    );
  }
  if (!profile) return <Redirect href="/profile" />;

  const create = async () => {
    if (!session) return;
    setBusy('create');
    setError(null);
    try {
      const { roomId } = await api.createRoom(session.token);
      router.push({ pathname: '/room/[roomId]', params: { roomId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a room');
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    if (!session) return;
    const roomId = normalizeRoomCode(code);
    if (!roomId) {
      setError('Room codes are 6 letters and digits, like K7M2QX');
      return;
    }
    setBusy('join');
    setError(null);
    try {
      const preview = (await api.getRoom(session.token, roomId)) as RoomPreview;
      if ('memberCount' in preview && preview.memberCount >= preview.maxMembers) {
        setError('That room is full');
        return;
      }
      router.push({ pathname: '/room/[roomId]', params: { roomId } });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'No room with that code. Check it with your friend.'
          : (err as Error).message,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: space.xs }}>
            <Title>Movie night, across borders</Title>
            <Body muted>
              Find films every friend can stream on their own subscriptions in their own country,
              then watch in sync.
            </Body>
          </View>

          {sessionError ? (
            <Banner tone="danger" action={{ label: 'Retry', onPress: retrySession }}>
              {sessionError}
            </Banner>
          ) : null}
          {error ? <Banner tone="warning">{error}</Banner> : null}

          <Card style={{ gap: space.sm }}>
            <Label>You</Label>
            <Body>
              {countryFlag(profile.country)} {profile.displayName}
            </Body>
            <Body muted>{profile.services.map((s) => getService(s)?.name ?? s).join(' · ')}</Body>
            <Button
              label="Edit streaming setup"
              variant="ghost"
              onPress={() => router.push('/profile')}
              style={{ alignSelf: 'flex-start' }}
            />
          </Card>

          <Card style={{ gap: space.md }}>
            <Label>Host</Label>
            <Button
              label="Start a watch party"
              onPress={create}
              loading={busy === 'create'}
              disabled={!session || busy !== null}
            />
          </Card>

          <Card style={{ gap: space.md }}>
            <Label>Join</Label>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Room code, e.g. K7M2QX"
              placeholderTextColor={c.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={64}
              returnKeyType="go"
              onSubmitEditing={join}
              accessibilityLabel="Room code"
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: radius.md,
                padding: space.md,
                fontSize: 20,
                letterSpacing: 4,
                color: c.text,
                backgroundColor: c.bg,
              }}
            />
            <Button
              label="Join party"
              variant="secondary"
              onPress={join}
              loading={busy === 'join'}
              disabled={!session || busy !== null || code.length === 0}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
