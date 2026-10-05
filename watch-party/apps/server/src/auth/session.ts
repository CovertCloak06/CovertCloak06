/**
 * Stateless anonymous sessions.
 *
 * The app has no accounts: a device asks for a session and receives a random
 * user id plus an HMAC-signed token binding that id to an expiry. The token is
 * presented on every HTTP request and in the Socket.io handshake, which is how
 * the server knows who sent a sync action without trusting payload fields.
 *
 * Format: `v1.<userId>.<expiresAtMs>.<base64url HMAC-SHA256>`
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';

export interface Session {
  userId: string;
  expiresAt: number;
}

export class SessionSigner {
  constructor(
    private readonly secret: string,
    private readonly ttlMs: number,
  ) {}

  issue(now = Date.now()): Session & { token: string } {
    const userId = `u_${randomBytes(12).toString('base64url')}`;
    const expiresAt = now + this.ttlMs;
    return { userId, expiresAt, token: this.sign(userId, expiresAt) };
  }

  sign(userId: string, expiresAt: number): string {
    const body = `${VERSION}.${userId}.${expiresAt}`;
    return `${body}.${this.mac(body)}`;
  }

  /** Returns the session for a valid, unexpired token, otherwise null. */
  verify(token: unknown, now = Date.now()): Session | null {
    if (typeof token !== 'string' || token.length > 256) return null;
    const parts = token.split('.');
    if (parts.length !== 4) return null;
    const [version, userId, expiresRaw, mac] = parts as [string, string, string, string];
    if (version !== VERSION || !/^u_[A-Za-z0-9_-]{8,32}$/.test(userId)) return null;
    const expiresAt = Number(expiresRaw);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;
    const expected = Buffer.from(this.mac(`${version}.${userId}.${expiresRaw}`));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return { userId, expiresAt };
  }

  private mac(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}

/** Extracts a bearer token from an Authorization header value. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1]! : null;
}
