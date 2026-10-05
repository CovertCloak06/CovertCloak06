import { countryFlag, getService } from '@watch-party/shared/client';

/** 3725.4 -> "1:02:05"; 65 -> "1:05". */
export function formatTimecode(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '–:––';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Signed drift in a short human form: "+120 ms", "-1.4 s". */
export function formatDrift(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '–';
  const sign = seconds > 0 ? '+' : seconds < 0 ? '−' : '±';
  const abs = Math.abs(seconds);
  return abs < 1 ? `${sign}${Math.round(abs * 1000)} ms` : `${sign}${abs.toFixed(1)} s`;
}

export function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function serviceName(id: string): string {
  return getService(id)?.name ?? id;
}

export function memberLabel(name: string, countryCode: string): string {
  return `${countryFlag(countryCode)} ${name}`.trim();
}

/** Milliseconds left until `startAtLocal`, as whole seconds for a countdown (never negative). */
export function countdownSeconds(startAtLocal: number, now: number): number {
  return Math.max(0, Math.ceil((startAtLocal - now) / 1000));
}
