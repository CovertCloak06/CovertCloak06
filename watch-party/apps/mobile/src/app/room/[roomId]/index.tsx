import type { CommonTitle, RoomMember } from '@watch-party/shared/client';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Share,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MemberList } from '@/components/MemberList';
import { TitleCard } from '@/components/TitleCard';
import { Banner, Body, Button, Card, Label, Screen } from '@/components/ui';
import { api, type MetaResponse } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useRoom, useRoomStore } from '@/lib/room-context';
import { shareLink } from '@/lib/room-code';
import { useCommonCatalog } from '@/lib/use-common-catalog';
import { radius, space, usePalette } from '@/lib/theme';

export default function Lobby() {
  const c = usePalette();
  const { session } = useApp();
  const store = useRoomStore();
  const { state, connection, error, joined } = useRoom();
  const isHost = !!state && !!session && state.hostId === session.userId;

  // --- catalog ---------------------------------------------------------------
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [meta, setMeta] = useState<MetaResponse | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    void api
      .meta()
      .then(setMeta)
      .catch(() => undefined);
  }, []);

  // The common catalog depends on who is here and what they subscribe to.
  const membershipKey = useMemo(
    () =>
      state?.members
        .map((m) => `${m.userId}:${m.countryCode}:${m.services.join('+')}`)
        .sort()
        .join('|') ?? '',
    [state?.members],
  );
  const catalog = useCommonCatalog({
    token: session?.token ?? null,
    roomId: state?.roomId ?? null,
    enabled: joined,
    query: debouncedQuery,
    membershipKey,
  });

  // --- follow the host into the player -----------------------------------------
  const seenSelection = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const at = state?.selection?.selectedAt ?? null;
    if (seenSelection.current === undefined) {
      seenSelection.current = at; // don't jump on first render of an existing selection
      return;
    }
    if (at && at !== seenSelection.current) {
      seenSelection.current = at;
      router.push({ pathname: '/room/[roomId]/watch', params: { roomId: state!.roomId } });
    }
  }, [state?.selection?.selectedAt, state?.roomId, state]);

  const pick = (t: CommonTitle) => {
    Alert.alert(`Watch “${t.title}”?`, 'Everyone in the room will be taken to the player.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start',
        onPress: () =>
          void store.client
            .selectTitle(t.tmdbId)
            .catch((err: Error) => Alert.alert('Could not choose that film', err.message)),
      },
    ]);
  };

  const memberActions = (m: RoomMember) => {
    if (!isHost) return;
    Alert.alert(m.displayName, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Make host',
        onPress: () =>
          void store.client.transferHost(m.userId).catch((e: Error) => Alert.alert(e.message)),
      },
    ]);
  };

  const share = () => {
    if (!state) return;
    void Share.share({
      message: `Join my watch party: room ${state.roomId}\n${shareLink(state.roomId)}`,
    });
  };

  const leave = () => {
    store.leave();
    router.dismissTo('/');
  };

  if (!state) {
    return (
      <Screen style={{ padding: space.lg, gap: space.lg, justifyContent: 'center' }}>
        {error ? (
          <>
            <Banner tone="danger">{error.message}</Banner>
            <Button label="Back" variant="secondary" onPress={() => router.dismissTo('/')} />
          </>
        ) : (
          <ActivityIndicator color={c.accent} />
        )}
      </Screen>
    );
  }

  const header = (
    <View style={{ gap: space.lg, marginBottom: space.lg }}>
      {connection === 'reconnecting' ? (
        <Banner tone="warning">Connection lost. Reconnecting…</Banner>
      ) : null}
      {error ? (
        <Banner tone="warning" action={{ label: 'OK', onPress: () => store.clearError() }}>
          {error.message}
        </Banner>
      ) : null}

      <Card style={{ gap: space.md }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View>
            <Label style={{ marginBottom: 0 }}>Room code</Label>
            <Text
              selectable
              style={{ color: c.text, fontSize: 30, fontWeight: '800', letterSpacing: 4 }}
            >
              {state.roomId}
            </Text>
          </View>
          <Button label="Invite" variant="secondary" onPress={share} />
        </View>
        <MemberList
          members={state.members}
          hostId={state.hostId}
          selfId={session?.userId ?? ''}
          {...(isHost ? { onMemberPress: memberActions } : {})}
        />
        {isHost ? (
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Body style={{ flex: 1 }}>Only I can play, pause and seek</Body>
            <Switch
              value={state.settings.hostOnlyControl}
              onValueChange={(v) =>
                void store.client.setHostOnlyControl(v).catch((e: Error) => Alert.alert(e.message))
              }
              accessibilityLabel="Host-only playback control"
            />
          </View>
        ) : null}
      </Card>

      {state.selection ? (
        <Card style={{ gap: space.sm }}>
          <Label>Now showing</Label>
          <Body style={{ fontWeight: '700' }}>{state.selection.title}</Body>
          <Button
            label="Go to the player"
            onPress={() =>
              router.push({ pathname: '/room/[roomId]/watch', params: { roomId: state.roomId } })
            }
          />
        </Card>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Label>Everyone can stream ({catalog.total})</Label>
        {!isHost ? (
          <Body muted>The host picks the film. You can browse while you wait.</Body>
        ) : null}
        {catalog.partial ? (
          <Banner tone="info">
            Some catalogs are large, so this list covers the most popular titles first.
          </Banner>
        ) : null}
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search titles"
          placeholderTextColor={c.muted}
          accessibilityLabel="Search titles"
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: radius.md,
            padding: space.md,
            color: c.text,
            backgroundColor: c.card,
          }}
        />
        {catalog.error ? (
          <Banner tone="danger" action={{ label: 'Retry', onPress: catalog.retry }}>
            {catalog.error}
          </Banner>
        ) : null}
      </View>
    </View>
  );

  return (
    <Screen>
      <Stack.Screen
        options={{ headerRight: () => <Button label="Leave" variant="ghost" onPress={leave} /> }}
      />
      <FlatList
        data={catalog.titles}
        keyExtractor={(t) => String(t.tmdbId)}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <TitleCard
            title={item}
            members={state.members}
            {...(isHost ? { onPress: () => pick(item) } : {})}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => void catalog.loadMore()}
        ListEmptyComponent={
          catalog.loading ? null : (
            <Body muted>
              {state.members.length < 2
                ? 'Invite a friend to see what you can all watch.'
                : 'No film is on everyone’s subscriptions right now. Try adding a service in your streaming setup.'}
            </Body>
          )
        }
        ListFooterComponent={
          <View style={{ paddingVertical: space.lg, gap: space.sm }}>
            {catalog.loading ? <ActivityIndicator color={c.accent} /> : null}
            {meta ? <Text style={{ color: c.muted, fontSize: 12 }}>{meta.attribution}</Text> : null}
          </View>
        }
      />
    </Screen>
  );
}
