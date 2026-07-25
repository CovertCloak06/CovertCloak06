"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { captureError } from "@/lib/integrations/monitoring";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; error?: string; id?: string };

const LEAD_STATUSES = [
  "unreviewed",
  "needs_follow_up",
  "insufficient_detail",
  "submitted_to_apd",
  "corroborated",
  "duplicate",
  "closed",
  "retain",
] as const;

const manualLeadSchema = z.object({
  title: z.string().min(3).max(300),
  intakeChannel: z.enum(["web", "email", "phone", "social", "in_person", "law_enforcement", "other"]),
  sourceClassification: z.enum(["firsthand", "recognition", "secondhand", "online", "speculation"]),
  originalNarrative: z.string().min(5).max(20000),
  submitterName: z.string().max(200).optional().or(z.literal("")),
  submitterPhone: z.string().max(50).optional().or(z.literal("")),
  submitterEmail: z.string().max(320).optional().or(z.literal("")),
  anonymous: z.boolean(),
});

/** Record a lead manually (phone/email/in-person intake). */
export async function createManualLead(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("review_leads");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const parsed = manualLeadSchema.safeParse({
      title: formData.get("title"),
      intakeChannel: formData.get("intakeChannel"),
      sourceClassification: formData.get("sourceClassification"),
      originalNarrative: formData.get("originalNarrative"),
      submitterName: formData.get("submitterName") ?? "",
      submitterPhone: formData.get("submitterPhone") ?? "",
      submitterEmail: formData.get("submitterEmail") ?? "",
      anonymous: formData.get("anonymous") === "on",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const input = parsed.data;

    const { data: caseRow } = await supabase.from("cases").select("id").eq("is_primary", true).maybeSingle();
    if (!caseRow) return { ok: false, error: "Primary case record missing" };

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        case_id: caseRow.id,
        created_by: session.userId,
        intake_channel: input.intakeChannel,
        source_classification: input.sourceClassification,
        title: input.title,
        summary: input.originalNarrative.slice(0, 240),
        original_narrative: input.originalNarrative,
        normalized_narrative: input.originalNarrative,
        submitter_name: input.anonymous ? null : input.submitterName || null,
        submitter_phone: input.anonymous ? null : input.submitterPhone || null,
        submitter_phone_normalized:
          input.anonymous || !input.submitterPhone ? null : normalizePhone(input.submitterPhone),
        submitter_email: input.anonymous ? null : input.submitterEmail || null,
        submitter_email_normalized:
          input.anonymous || !input.submitterEmail ? null : normalizeEmail(input.submitterEmail),
        anonymous: input.anonymous,
      })
      .select("id, human_id")
      .single();
    if (error || !lead) return { ok: false, error: error?.message ?? "Insert failed" };

    await supabase.from("lead_status_history").insert({
      lead_id: lead.id,
      to_status: "unreviewed",
      reason: `Recorded manually via ${input.intakeChannel}`,
      created_by: session.userId,
    });

    await recordAuditEvent({
      actorId: session.userId,
      action: "create",
      entityType: "lead",
      entityId: lead.id,
      afterState: { human_id: lead.human_id, channel: input.intakeChannel },
    });

    revalidatePath("/admin/leads");
    return { ok: true, id: lead.id };
  } catch (error) {
    captureError(error, { where: "createManualLead" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function updateLeadStatus(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("review_leads");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const leadId = z.string().uuid().parse(formData.get("leadId"));
    const status = z.enum(LEAD_STATUSES).parse(formData.get("status"));
    const reason = z.string().max(1000).optional().parse(formData.get("reason") ?? undefined);

    const { data: before } = await supabase.from("leads").select("status").eq("id", leadId).single();
    const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
    if (error) return { ok: false, error: error.message };

    await supabase.from("lead_status_history").insert({
      lead_id: leadId,
      from_status: before?.status ?? null,
      to_status: status,
      reason: reason || null,
      created_by: session.userId,
    });

    await recordAuditEvent({
      actorId: session.userId,
      action: "update",
      entityType: "lead",
      entityId: leadId,
      beforeState: { status: before?.status },
      afterState: { status },
      reason,
    });

    revalidatePath(`/admin/leads/${leadId}`);
    revalidatePath("/admin/leads");
    return { ok: true };
  } catch (error) {
    captureError(error, { where: "updateLeadStatus" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function updateLeadTriage(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("review_leads");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const leadId = z.string().uuid().parse(formData.get("leadId"));
    const priority = z.enum(["unassigned", "routine", "important", "urgent"]).parse(formData.get("priority"));
    const summary = z.string().max(2000).parse(formData.get("summary") ?? "");
    const normalizedNarrative = z.string().max(20000).parse(formData.get("normalizedNarrative") ?? "");
    const tagsRaw = z.string().max(500).parse(formData.get("tags") ?? "");
    const tags = tagsRaw
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    const { error } = await supabase
      .from("leads")
      .update({ priority, summary, normalized_narrative: normalizedNarrative, tags })
      .eq("id", leadId);
    if (error) return { ok: false, error: error.message };

    await recordAuditEvent({
      actorId: session.userId,
      action: "update",
      entityType: "lead",
      entityId: leadId,
      afterState: { priority, tags },
    });

    revalidatePath(`/admin/leads/${leadId}`);
    return { ok: true };
  } catch (error) {
    captureError(error, { where: "updateLeadTriage" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function addLeadNote(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("review_leads");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const leadId = z.string().uuid().parse(formData.get("leadId"));
    const body = z.string().min(1).max(10000).parse(formData.get("body"));
    const sensitive = formData.get("sensitive") === "on";

    const { error } = await supabase.from("lead_notes").insert({
      lead_id: leadId,
      body,
      sensitive,
      created_by: session.userId,
    });
    if (error) return { ok: false, error: error.message };

    await recordAuditEvent({
      actorId: session.userId,
      action: "create",
      entityType: "lead_note",
      entityId: leadId,
    });

    revalidatePath(`/admin/leads/${leadId}`);
    return { ok: true };
  } catch (error) {
    captureError(error, { where: "addLeadNote" });
    return { ok: false, error: "Unexpected error" };
  }
}

/** Generate a short-lived signed URL for a private original. Audited. */
export async function getAttachmentSignedUrl(
  attachmentId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const session = await requirePermission("manage_files");
    const admin = createSupabaseAdminClient();
    const supabase = await createSupabaseServerClient();
    if (!admin || !supabase) return { ok: false, error: "Storage unavailable" };

    const { data: attachment } = await supabase
      .from("attachments")
      .select("id, storage_bucket, storage_path, soft_deleted_at")
      .eq("id", z.string().uuid().parse(attachmentId))
      .single();
    if (!attachment || attachment.soft_deleted_at) {
      return { ok: false, error: "Attachment not found" };
    }

    const { data, error } = await admin.storage
      .from(attachment.storage_bucket)
      .createSignedUrl(attachment.storage_path, 120); // 2-minute expiry
    if (error || !data) return { ok: false, error: error?.message ?? "Signing failed" };

    await recordAuditEvent({
      actorId: session.userId,
      action: "generate_signed_url",
      entityType: "attachment",
      entityId: attachment.id,
      reason: "Admin download of private original",
    });

    return { ok: true, url: data.signedUrl };
  } catch (error) {
    captureError(error, { where: "getAttachmentSignedUrl" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function reviewDuplicateSuggestion(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("review_leads");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const suggestionId = z.string().uuid().parse(formData.get("suggestionId"));
    const decision = z.enum(["confirmed", "rejected"]).parse(formData.get("decision"));

    const { error } = await supabase
      .from("lead_duplicate_suggestions")
      .update({ status: decision, reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
      .eq("id", suggestionId);
    if (error) return { ok: false, error: error.message };

    await recordAuditEvent({
      actorId: session.userId,
      action: "update",
      entityType: "lead_duplicate_suggestion",
      entityId: suggestionId,
      afterState: { status: decision },
    });

    revalidatePath("/admin/leads");
    return { ok: true };
  } catch (error) {
    captureError(error, { where: "reviewDuplicateSuggestion" });
    return { ok: false, error: "Unexpected error" };
  }
}
