import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { countdownSeconds, formatTimecode } from '@/lib/format';
import { usePalette } from '@/lib/theme';

/** Full-screen "3, 2, 1" overlay for a scheduled synchronised start. */
export function Countdown({ startAtLocal, timecode, onDone, manual }: { startAtLocal: number; timecode: number; onDone: () => void; manual: boolean }) {
  const c = usePalette();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  const left = countdownSeconds(startAtLocal, now);
  useEffect(() => {
    if (now >= startAtLocal + 1_500) onDone();
  }, [now, startAtLocal, onDone]);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center' }]} accessibilityLiveRegion="assertive">
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
        {manual ? `Get ready at ${formatTimecode(timecode)} in your app` : `Starting together at ${formatTimecode(timecode)}`}
      </Text>
      <Text style={{ color: '#fff', fontSize: 96, fontWeight: '900' }}>{left > 0 ? left : manual ? 'Play!' : '▶'}</Text>
    </View>
  );
}
