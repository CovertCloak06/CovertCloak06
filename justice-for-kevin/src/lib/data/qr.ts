import "server-only";
import { sanitizeCampaignSrc } from "@/lib/qr";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

/**
 * Record an aggregate QR/campaign scan: campaign slug, coarse referrer host,
 * and day only. No IPs, no precise location, no per-visitor identifiers.
 */
export async function recordQrScan(rawSrc: string): Promise<void> {
  const slug = sanitizeCampaignSrc(rawSrc);
  if (!slug) return;
  const admin = createSupabaseAdminClient();
  if (!admin) return;

  let referrerHost: string | null = null;
  try {
    const referer = (await headers()).get("referer");
    if (referer) referrerHost = new URL(referer).hostname;
  } catch {
    referrerHost = null;
  }

  await admin.from("qr_scans").insert({ campaign_slug: slug, referrer_host: referrerHost });

  // Atomic counter update (see migration 0003) — concurrent scans each land.
  await admin.rpc("record_campaign_scan", { p_slug: slug });
}
