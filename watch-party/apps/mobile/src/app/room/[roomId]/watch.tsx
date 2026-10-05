import {
  getService,
  parsePlayerEvent,
  type PlayerCommand,
  type WatchOption,
} from '@watch-party/shared/client';
import { buildCommandInjection, buildPlayerInjection } from '@watch-party/shared/player';
import * as Crypto from 'expo-crypto';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { Countdown } from '@/components/Countdown';
import { NativeFallback } from '@/components/NativeFallback';
import { Banner, Body, Button, Screen, StatusDot } from '@/components/ui';
import { useApp } from '@/lib/app-context';
import { formatDrift } from '@/lib/format';
import {
  adapterFor,
  decideNavigation,
  DESKTOP_USER_AGENT,
  initialPlaybackMode,
  preferredOption,
  type PlaybackMode,
} from '@/lib/navigation';
import { useRoom, useRoomStore } from '@/lib/room-context';
import { radius, space, usePalette } from '@/lib/theme';

function randomNonce(): string {
  return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function Watch() {
  useKeepAwake();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { session } = useApp();
  const store = useRoomStore();
  const { state, drift, connection, scheduled, lastRemoteAction, autoplayBlocked } = useRoom();

  const options: WatchOption[] = (session && state?.selection?.watchOptions[session.userId]) || [];
  const [optionIndex, setOptionIndex] = useState<number | null>(null);
  const option = optionIndex !== null ? (options[optionIndex] ?? null) : preferredOption(options);

  const [mode, setMode] = useState<PlaybackMode>('webview');
  const [fallbackReason, setFallbackReason] = useState('');
  const [desktopSite, setDesktopSite] = useState(false);
  const [webKey, setWebKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const webRef = useRef<WebView>(null);
  const nonce = useMemo(randomNonce, []);

  // Pick the starting mode whenever the chosen service changes.
  useEffect(() => {
    if (!option) return;
    const initial = initialPlaybackMode(option);
    setMode(initial);
    if (initial === 'native') {
      setFallbackReason(`${option.serviceName} doesn't allow playback inside other apps on phones, so you'll watch in the ${option.serviceName} app and sync by the room clock.`);
    }
  }, [option?.serviceId, option]);

  const service = option ? getService(option.serviceId) : undefined;
  const injection = useMemo(
    () => (option ? buildPlayerInjection({ nonce, adapter: adapterFor(option.serviceId) }) : ''),
    [nonce, option?.serviceId, option],
  );

  // Commands from the room go into the page as a string literal (never code).
  const port = useMemo(
    () => ({
      send(command: PlayerCommand) {
        webRef.current?.injectJavaScript(buildCommandInjection(nonce, command));
      },
    }),
    [nonce],
  );

  useEffect(() => {
    if (mode !== 'webview' || !option) return;
    store.client.attachPlayer(port);
    store.client.reportStatus('loading');
    return () => store.client.detachPlayer();
  }, [mode, option?.serviceId, option, port, store, webKey]);

  // "Ben paused" toasts.
  useEffect(() => {
    if (!lastRemoteAction || !state) return;
    const who = state.members.find((m) => m.userId === lastRemoteAction.senderId)?.displayName ?? 'Someone';
    const verb = lastRemoteAction.action === 'PLAY' ? 'pressed play' : lastRemoteAction.action === 'PAUSE' ? 'paused' : 'skipped';
    setToast(`${who} ${verb}`);
    const t = setTimeout(() => setToast(null), 2_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRemoteAction]);

  const switchToNative = useCallback(
    (reason: string) => {
      setFallbackReason(reason);
      setMode('native');
    },
    [],
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const event = parsePlayerEvent(e.nativeEvent.data, nonce);
      if (!event) return; // not ours, or forged by the page
      if (event.type === 'PLAYER_ERROR' && event.code === 'PLAYBACK_FAILED' && option) {
        Alert.alert(
          `${option.serviceName} won't play here`,
          `This device blocks protected video inside apps. Watch in the ${option.serviceName} app and sync by the room clock instead?`,
          [
            { text: 'Stay', style: 'cancel' },
            { text: 'Use the app', onPress: () => switchToNative(`Playback was blocked in the in-app player (${event.message}).`) },
          ],
        );
      }
      store.client.handlePlayerEvent(event);
    },
    [nonce, option, store, switchToNative],
  );

  const onShouldStart = useCallback(
    (req: ShouldStartLoadRequest) => {
      if (!service) return false;
      const decision = decideNavigation(req.url, req.isTopFrame ?? true, service);
      if (decision === 'external') void Linking.openURL(req.url).catch(() => undefined);
      return decision === 'allow';
    },
    [service],
  );

  const showMenu = () => {
    if (!option) return;
    const items: Array<{ label: string; run: () => void; destructive?: boolean }> = [
      { label: `Watch in the ${option.serviceName} app`, run: () => switchToNative('You chose the native app. Sync by the room clock.') },
      { label: desktopSite ? 'Use mobile site' : 'Request desktop site', run: () => { setDesktopSite((d) => !d); setWebKey((k) => k + 1); } },
      { label: 'Reload player', run: () => setWebKey((k) => k + 1) },
      ...options
        .map((o, i) => ({ o, i }))
        .filter(({ o }) => o.serviceId !== option.serviceId)
        .map(({ o, i }) => ({ label: `Switch to ${o.serviceName}`, run: () => setOptionIndex(i) })),
      { label: 'Back to lobby', run: () => router.back() },
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...items.map((i) => i.label), 'Cancel'], cancelButtonIndex: items.length },
        (idx) => items[idx]?.run(),
      );
    } else {
      Alert.alert('Player', undefined, [...items.map((i) => ({ text: i.label, onPress: i.run })), { text: 'Cancel', style: 'cancel' as const }]);
    }
  };

  if (!state?.selection) {
    return (
      <Screen style={{ padding: space.lg, justifyContent: 'center', gap: space.lg }}>
        <Body>The host hasn't picked a film yet.</Body>
        <Button label="Back to lobby" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (!option) {
    return (
      <Screen style={{ padding: space.lg, justifyContent: 'center', gap: space.lg }}>
        <Banner tone="warning">
          “{state.selection.title}” isn't on any of your subscriptions in your country. You may be able to rent it on a store.
        </Banner>
        <Button label="Back to lobby" onPress={() => router.back()} />
      </Screen>
    );
  }

  const isHost = session?.userId === state.hostId;
  const others = state.members.filter((m) => m.userId !== session?.userId);
  const waitingOn = others.filter((m) => m.status === 'buffering' || m.status === 'loading' || m.status === 'blocked');

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={[styles.bar, { paddingTop: insets.top + space.xs, backgroundColor: c.bg, borderColor: c.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to lobby" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ color: c.accent, fontSize: 16, fontWeight: '700' }}>‹ Lobby</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text numberOfLines={1} style={{ color: c.text, fontWeight: '700' }}>
            {state.selection.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <StatusDot color={connection === 'connected' ? c.success : c.warning} />
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {option.serviceName} · {isHost ? 'you are the time source' : `drift ${formatDrift(drift)}`} · {state.members.length} watching
            </Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Player options" onPress={showMenu} hitSlop={12}>
          <Text style={{ color: c.accent, fontSize: 22, fontWeight: '800' }}>⋯</Text>
        </Pressable>
      </View>

      {connection === 'reconnecting' ? <Banner tone="warning">Reconnecting… playback keeps going locally.</Banner> : null}
      {autoplayBlocked ? (
        <Banner tone="info" action={{ label: 'OK', onPress: () => store.dismissAutoplayBlocked() }}>
          Tap play in the player to catch up with everyone.
        </Banner>
      ) : null}
      {waitingOn.length > 0 ? (
        <Text style={{ color: '#ddd', backgroundColor: '#111', padding: space.xs, textAlign: 'center', fontSize: 12 }}>
          Waiting on {waitingOn.map((m) => m.displayName).join(', ')}
        </Text>
      ) : null}

      {mode === 'webview' ? (
        <WebView
          key={`${option.serviceId}:${webKey}`}
          ref={webRef}
          source={{ uri: option.webUrl }}
          style={{ flex: 1, backgroundColor: '#000' }}
          injectedJavaScriptBeforeContentLoaded={injection}
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStart}
          originWhitelist={['https://*']}
          // Playback: inline, no gesture needed for synced play, DRM enabled on Android.
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          allowsProtectedMedia
          // Logins stay in the WebView's own cookie jar (spec rule 3): not shared with Safari.
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          {...(desktopSite ? { userAgent: DESKTOP_USER_AGENT } : {})}
          onRenderProcessGone={() => setWebKey((k) => k + 1)}
          onContentProcessDidTerminate={() => setWebKey((k) => k + 1)}
          onLoadStart={() => store.client.reportStatus('loading')}
          webviewDebuggingEnabled={__DEV__}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
          <NativeFallback
            option={option}
            reason={fallbackReason}
            {...(option.mobileWeb !== 'unsupported' ? { onTryWebView: () => setMode('webview') } : {})}
          />
        </View>
      )}

      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + space.xl, backgroundColor: c.overlay }]}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{toast}</Text>
        </View>
      ) : null}

      {scheduled && scheduled.startAtLocal + 1_500 > Date.now() ? (
        <Countdown
          startAtLocal={scheduled.startAtLocal}
          timecode={scheduled.timecode}
          manual={mode === 'native'}
          onDone={() => store.clearScheduled()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
});
