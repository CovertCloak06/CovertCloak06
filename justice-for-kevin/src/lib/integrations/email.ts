import "server-only";

/**
 * Transactional email boundary (Resend). When RESEND_API_KEY is unset the
 * send is mocked: logged (without the body, which may contain sensitive
 * submission content) and reported as not delivered. See SETUP.md →
 * "Enabling email delivery".
 */
export type EmailResult =
  | { delivered: true; providerId: string }
  | { delivered: false; skipped: boolean; error?: string };

export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not configured — mock send to ${options.to}: "${options.subject}"`);
    return { delivered: false, skipped: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: `Justice for Kevin <notifications@${new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.org").hostname}>`,
        to: [options.to],
        subject: options.subject,
        text: options.text,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
    });
    if (!response.ok) {
      return { delivered: false, skipped: false, error: `HTTP ${response.status}` };
    }
    const body = (await response.json()) as { id?: string };
    return { delivered: true, providerId: body.id ?? "unknown" };
  } catch (error) {
    return { delivered: false, skipped: false, error: String(error) };
  }
}
