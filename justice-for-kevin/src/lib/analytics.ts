"use client";

/**
 * Privacy-conscious aggregate analytics. Events are forwarded to Umami when
 * the script is configured (see layout.tsx); otherwise they are no-ops.
 * No cross-site tracking, no fingerprinting, no visitor IPs.
 */

type UmamiGlobal = { track?: (event: string, data?: Record<string, string>) => void };

export type AnalyticsEvent =
  | "witness_image_view"
  | "flyer_download"
  | "share_click"
  | "detective_call_click"
  | "detective_email_click"
  | "report_pdf_download"
  | "qr_generated";

export function trackEvent(event: AnalyticsEvent, data?: Record<string, string>): void {
  try {
    const umami = (window as unknown as { umami?: UmamiGlobal }).umami;
    umami?.track?.(event, data);
  } catch {
    // analytics must never break the page
  }
}
