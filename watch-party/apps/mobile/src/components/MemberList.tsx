import type { MemberStatus, RoomMember } from '@watch-party/shared/client';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTimecode, memberLabel, serviceName } from '@/lib/format';
import { space, usePalette, type Palette } from '@/lib/theme';
import { StatusDot } from './ui';

const STATUS_TEXT: Record<MemberStatus, string> = {
  idle: 'In the lobby',
  loading: 'Opening the film…',
  ready: 'Ready',
  playing: 'Watching',
  paused: 'Paused',
  buffering: 'Buffering…',
  blocked: 'Tap play to join in',
  fallback: 'Watching in the app (manual sync)',
};

function statusColor(status: MemberStatus, connected: boolean, c: Palette): string {
  if (!connected) return c.muted;
  if (status === 'playing' || status === 'ready') return c.success;
  if (status === 'buffering' || status === 'loading' || status === 'blocked') return c.warning;
  return c.accent;
}

export function MemberList({
  members,
  hostId,
  selfId,
  onMemberPress,
}: {
  members: RoomMember[];
  hostId: string;
  selfId: string;
  onMemberPress?: (m: RoomMember) => void;
}) {
  const c = usePalette();
  return (
    <View style={{ gap: space.sm }}>
      {members.map((m) => (
        <Pressable
          key={m.userId}
          disabled={!onMemberPress || m.userId === selfId}
          onPress={() => onMemberPress?.(m)}
          accessibilityRole={onMemberPress && m.userId !== selfId ? 'button' : 'text'}
          accessibilityLabel={`${m.displayName}${m.userId === hostId ? ', host' : ''}, ${STATUS_TEXT[m.status]}`}
          style={[styles.row, { borderColor: c.border }]}
        >
          <StatusDot color={statusColor(m.status, m.connected, c)} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>
              {memberLabel(m.displayName, m.countryCode)}
              {m.userId === selfId ? ' (you)' : ''}
              {m.userId === hostId ? '  ★ host' : ''}
            </Text>
            <Text style={{ color: c.muted, fontSize: 13 }}>
              {m.connected ? STATUS_TEXT[m.status] : 'Reconnecting…'}
              {m.timecode !== null && (m.status === 'playing' || m.status === 'paused')
                ? ` · ${formatTimecode(m.timecode)}`
                : ''}
              {' · '}
              {m.services.map(serviceName).join(', ')}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
