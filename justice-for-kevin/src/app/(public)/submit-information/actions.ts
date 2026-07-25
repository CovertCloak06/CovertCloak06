"use server";

import { headers } from "next/headers";
import { recordAuditEvent } from "@/lib/audit";
import { caseSeed } from "@/lib/case";
import { getSiteSettings } from "@/lib/data/public";
import { sha256Hex } from "@/lib/hash";
import { verifyTurnstileToken } from "@/lib/integrations/turnstile";
import { captureError } from "@/lib/integrations/monitoring";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { checkRateLimit } from "@/lib/rate-limit";
import { categoryLabel } from "@/lib/report";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isAcceptedFile, MAX_ATTACHMENT_BYTES, tipSchema } from "@/lib/tip-schema";

export type SecureIntakeResult =
  | { ok: true; leadReference: string }
  | { ok: false; error: string };

/**
 * Secure intake: only active when an administrator has enabled it in site
 * settings. Validates Turnstile + rate limit, re-validates the payload with
 * Zod, stores the lead and original attachments (private bucket, hashed,
 * never recompressed), and writes an audit event. Uses the service role —
 * anonymous clients have no database or storage access at all.
 */
export async function submitSecureTip(formData: FormData): Promise<SecureIntakeResult> {
  try {
    const settings = await getSiteSettings();
    if (!settings.secureIntakeEnabled) {
      return { ok: false, error: "Secure intake is not enabled. Use the direct-delivery options." };
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return { ok: false, error: "Secure intake is not available right now. Use the direct-delivery options." };
    }

    const headerStore = await headers();
    const ip =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    const rate = checkRateLimit(`tip:${ip}`, 5, 60 * 60 * 1000);
    if (!rate.allowed) {
      return { ok: false, error: `Too many submissions. Try again in ${Math.ceil(rate.retryAfterSeconds / 60)} minutes.` };
    }

    const turnstile = await verifyTurnstileToken(
      formData.get("turnstileToken")?.toString(),
      ip === "unknown" ? undefined : ip,
    );
    if (!turnstile.ok) {
      return { ok: false, error: "Verification failed. Please try again." };
    }

    const parsed = tipSchema.safeParse(JSON.parse(formData.get("tip")?.toString() ?? "{}"));
    if (!parsed.success) {
      return { ok: false, error: "The submission is incomplete or invalid. Review each step and try again." };
    }
    const tip = parsed.data;

    const { data: caseRow } = await admin
      .from("cases")
      .select("id")
      .eq("is_primary", true)
      .maybeSingle();
    if (!caseRow) {
      return { ok: false, error: "Case record unavailable. Use the direct-delivery options." };
    }

    const narrative = tip.details.narrative.trim();
    const { data: lead, error: leadError } = await admin
      .from("leads")
      .insert({
        case_id: caseRow.id,
        intake_channel: "web",
        source_classification: tip.sourceClassification,
        status: "unreviewed",
        title: `${categoryLabel(tip.category)} — web submission`,
        summary: narrative.slice(0, 240),
        original_narrative: JSON.stringify(
          { category: tip.category, details: tip.details, submittedAt: new Date().toISOString() },
          null,
          2,
        ),
        normalized_narrative: narrative,
        submitter_name: tip.contact.anonymous ? null : tip.contact.fullName || null,
        submitter_phone: tip.contact.anonymous ? null : tip.contact.phone || null,
        submitter_phone_normalized: tip.contact.anonymous || !tip.contact.phone ? null : normalizePhone(tip.contact.phone),
        submitter_email: tip.contact.anonymous ? null : tip.contact.email || null,
        submitter_email_normalized: tip.contact.anonymous || !tip.contact.email ? null : normalizeEmail(tip.contact.email),
        anonymous: tip.contact.anonymous,
      })
      .select("id, human_id")
      .single();

    if (leadError || !lead) {
      captureError(leadError ?? new Error("lead insert returned no row"), { where: "submitSecureTip" });
      return { ok: false, error: "Could not store the submission. Use the direct-delivery options." };
    }

    // Store original attachments privately, verifying size/type/hash.
    const files = formData.getAll("files") as File[];
    for (const file of files.slice(0, 20)) {
      if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) continue;
      if (!isAcceptedFile(file.name, file.type)) continue;

      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha256 = await sha256Hex(bytes);
      const storagePath = `${lead.id}/${sha256}-${file.name.replace(/[^\w.-]+/g, "_")}`;

      const { error: uploadError } = await admin.storage
        .from("private-originals")
        .upload(storagePath, bytes, {
          contentType: file.type || "application/octet-stream",
          upsert: false, // originals are never overwritten
        });
      if (uploadError) {
        captureError(uploadError, { where: "submitSecureTip:upload" });
        continue;
      }

      await admin.from("attachments").insert({
        lead_id: lead.id,
        storage_bucket: "private-originals",
        storage_path: storagePath,
        original_filename: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        sha256,
        virus_scan_status: "pending", // integration point — see SECURITY.md
      });
    }

    await admin.from("lead_status_history").insert({
      lead_id: lead.id,
      from_status: null,
      to_status: "unreviewed",
      reason: "Created via secure web intake",
    });

    await recordAuditEvent({
      actorId: null,
      action: "create",
      entityType: "lead",
      entityId: lead.id,
      afterState: { human_id: lead.human_id, channel: "web", anonymous: tip.contact.anonymous },
      reason: "Public secure intake",
      ip,
    });

    return { ok: true, leadReference: lead.human_id };
  } catch (error) {
    captureError(error, { where: "submitSecureTip" });
    return { ok: false, error: "Unexpected error. Use the direct-delivery options." };
  }
}

/** Case info for client PDF generation (avoids trusting client constants). */
export async function getCaseInfoAction() {
  return caseSeed;
}
