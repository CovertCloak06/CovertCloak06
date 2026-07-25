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

  // Maintain first/last/scan_count on the campaign row when it exists.
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, scan_count, first_scan_at")
    .eq("slug", slug)
    .maybeSingle();
  if (campaign) {
    await admin
      .from("campaigns")
      .update({
        scan_count: (campaign.scan_count ?? 0) + 1,
        first_scan_at: campaign.first_scan_at ?? new Date().toISOString(),
        last_scan_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
  }
}
