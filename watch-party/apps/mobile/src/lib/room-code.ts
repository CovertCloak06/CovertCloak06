import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@watch-party/shared/client';

/**
 * Normalises a typed or pasted room code: accepts a share link, ignores case,
 * spaces and dashes. Codes never contain I, O, 0 or 1, so anything with those
 * characters is rejected rather than guessed at.
 */
export function normalizeRoomCode(input: string): string | null {
  const fromLink = /room\/([A-Za-z0-9]{6})(?![A-Za-z0-9])/.exec(input);
  const raw = (fromLink ? fromLink[1]! : input).toUpperCase().replace(/[\s-]/g, '');
  if (raw.length !== ROOM_CODE_LENGTH) return null;
  return [...raw].every((c) => ROOM_CODE_ALPHABET.includes(c)) ? raw : null;
}

/** Deep link that opens the app straight into the room (expo-router route room/[roomId]). */
export function shareLink(roomId: string): string {
  return `watchparty://room/${roomId}`;
}
