import type { CommonTitle, RoomMember } from '@watch-party/shared/client';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatRuntime } from '@/lib/format';
import { radius, space, usePalette } from '@/lib/theme';

export function TitleCard({
  title,
  members,
  onPress,
  disabled,
}: {
  title: CommonTitle;
  members: RoomMember[];
  onPress?: () => void;
  disabled?: boolean;
}) {
  const c = usePalette();
  const meta = [title.releaseYear, formatRuntime(title.runtimeMinutes), title.genres.slice(0, 2).join(' · ')]
    .filter(Boolean)
    .join('  ·  ');
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${title.title}${title.releaseYear ? `, ${title.releaseYear}` : ''}`}
      accessibilityHint={onPress ? 'Choose this film for everyone' : undefined}
      style={({ pressed }) => [styles.card, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}
    >
      {title.posterUrl ? (
        <Image source={{ uri: title.posterUrl }} style={styles.poster} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.poster, { backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: c.muted, fontSize: 28, fontWeight: '800' }}>{title.title.slice(0, 1)}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: space.xs }}>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }} numberOfLines={2}>
          {title.title}
        </Text>
        {meta ? <Text style={{ color: c.muted, fontSize: 13 }}>{meta}</Text> : null}
        <View style={{ gap: 2, marginTop: space.xs }}>
          {members.map((m) => {
            const options = title.watchOptions[m.userId] ?? [];
            return (
              <Text key={m.userId} style={{ color: c.text, fontSize: 13 }} numberOfLines={1}>
                <Text style={{ color: c.muted }}>{m.displayName}: </Text>
                {options.length ? options.map((o) => o.serviceName).join(' or ') : 'not available'}
              </Text>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  poster: { width: 72, height: 108, borderRadius: radius.sm },
});
