import "server-only";

/**
 * Cloudflare Turnstile verification boundary. When TURNSTILE_SECRET_KEY is
 * unset (local development, preview without keys) verification is skipped
 * and clearly logged; production deployments must set both keys
 * (see SETUP.md → "Enabling Turnstile").
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<{ ok: boolean; skipped: boolean }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("[turnstile] secret not configured — verification skipped");
    return { ok: true, skipped: true };
  }
  if (!token) return { ok: false, skipped: false };

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          ...(remoteIp ? { remoteip: remoteIp } : {}),
        }),
      },
    );
    const result = (await response.json()) as { success?: boolean };
    return { ok: Boolean(result.success), skipped: false };
  } catch (error) {
    console.error("[turnstile] verification request failed:", error);
    return { ok: false, skipped: false };
  }
}
