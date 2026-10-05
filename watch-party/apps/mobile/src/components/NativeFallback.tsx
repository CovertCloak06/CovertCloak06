import type { WatchOption } from '@watch-party/shared/client';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { formatTimecode } from '@/lib/format';
import { useRoom, useRoomStore } from '@/lib/room-context';
import { space, usePalette } from '@/lib/theme';
import { Banner, Body, Button, Card, Label } from './ui';

/**
 * Native-app fallback (spec rule 2). Used when the service blocks playback in
 * an embedded WebView (DRM, mobile-web restrictions). The app can't control a
 * native player, so sync becomes manual: everyone sees the room's live
 * position and the host can run a synchronised countdown.
 */
export function NativeFallback({ option, reason, onTryWebView }: { option: WatchOption; reason: string; onTryWebView?: () => void }) {
  const c = usePalette();
  const store = useRoomStore();
  const { state } = useRoom();
  const [roomTime, setRoomTime] = useState<number | null>(store.client.roomTimecode());
  const isHost = store.client.isHost;

  useEffect(() => {
    store.client.reportStatus('fallback');
    const t = setInterval(() => setRoomTime(store.client.roomTimecode()), 250);
    return () => clearInterval(t);
  }, [store]);

  const openApp = async () => {
    try {
      await Linking.openURL(option.nativeUrl);
    } catch {
      try {
        await Linking.openURL(option.webUrl);
      } catch {
        Alert.alert(`Couldn't open ${option.serviceName}`, 'Is the app installed?');
      }
    }
  };

  const startTogether = () => {
    void store.client.scheduleStart(Math.max(0, roomTime ?? 0), 5_000).catch((e: Error) => Alert.alert(e.message));
  };

  const paused = state?.playback.paused ?? true;
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <Banner tone="info">{reason}</Banner>
      <Card style={{ gap: space.md }}>
        <Label>Room position</Label>
        <Text style={{ color: c.text, fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">
          {formatTimecode(roomTime)}
        </Text>
        <Body muted>{paused ? 'Paused' : 'Playing'} · scrub your app to this time</Body>
        <Button label={`Open in ${option.serviceName}`} onPress={() => void openApp()} />
        {!option.directLink ? (
          <Body muted style={{ fontSize: 13 }}>
            No direct link for this title on {option.serviceName}, so you'll land on its search. Look for “{state?.selection?.title}”.
          </Body>
        ) : null}
      </Card>
      <Card style={{ gap: space.md }}>
        <Label>Start together</Label>
        <Body muted>
          {isHost
            ? 'Get everyone paused at the same moment, then run a 5-second countdown. Everyone presses play on zero.'
            : 'The host can run a countdown. When it hits zero, press play in your app.'}
        </Body>
        {isHost ? <Button label="Run countdown from room position" variant="secondary" onPress={startTogether} /> : null}
      </Card>
      {onTryWebView ? (
        <View>
          <Button label="Try the in-app player instead" variant="ghost" onPress={onTryWebView} />
        </View>
      ) : null}
    </ScrollView>
  );
}
