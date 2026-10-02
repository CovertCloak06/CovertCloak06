"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { captureError } from "@/lib/integrations/monitoring";
import {
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizePlate,
  normalizeUrl,
  normalizeUsername,
} from "@/lib/normalize";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; error?: string; id?: string };

const ENTITY_TYPES = [
  "person",
  "nickname",
  "vehicle",
  "location",
  "business",
  "organization",
  "phone",
  "email",
  "username",
  "social_account",
  "document",
  "image",
  "video",
  "other",
] as const;

function normalizeEntityValue(type: string, value: string): string {
  switch (type) {
    case "phone":
      return normalizePhone(value);
    case "email":
      return normalizeEmail(value);
    case "username":
    case "social_account":
      return normalizeUsername(value);
    case "vehicle":
      return normalizePlate(value) || normalizeName(value);
    case "person":
    case "nickname":
      return normalizeName(value);
    default:
      return value.startsWith("http") ? normalizeUrl(value) : normalizeName(value);
  }
}

export async function createEntity(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("manage_entities");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const type = z.enum(ENTITY_TYPES).parse(formData.get("type"));
    const displayName = z.string().min(1).max(300).parse(formData.get("displayName"));
    const description = z.string().max(2000).parse(formData.get("description") ?? "");

    const { data, error } = await supabase
      .from("entities")
      .insert({
        type,
        display_name: displayName,
        normalized_value: normalizeEntityValue(type, displayName),
        description: description || null,
        created_by: session.userId,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };

    await recordAuditEvent({
      actorId: session.userId,
      action: "create",
      entityType: "entity",
      entityId: data.id,
      afterState: { type, displayName },
    });
    revalidatePath("/admin/entities");
    return { ok: true, id: data.id };
  } catch (error) {
    captureError(error, { where: "createEntity" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function linkEntityToLead(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("manage_entities");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const entityId = z.string().uuid().parse(formData.get("entityId"));
    const leadHumanId = z.string().min(1).parse(formData.get("leadHumanId"));
    const relationship = z.string().min(1).max(50).parse(formData.get("relationship"));
    const confidence = z.enum(["stated", "probable", "uncertain", "machine_suggested"]).parse(
      formData.get("confidence"),
    );

    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("human_id", leadHumanId.trim().toUpperCase())
      .maybeSingle();
    if (!lead) return { ok: false, error: `No lead with ID ${leadHumanId}` };

    const { error } = await supabase.from("lead_entities").insert({
      lead_id: lead.id,
      entity_id: entityId,
      relationship,
      confidence,
      created_by: session.userId,
    });
    if (error) return { ok: false, error: error.message };

    await recordAuditEvent({
      actorId: session.userId,
      action: "create",
      entityType: "lead_entity",
      entityId,
      afterState: { leadId: lead.id, relationship, confidence },
    });
    revalidatePath(`/admin/entities/${entityId}`);
    return { ok: true };
  } catch (error) {
    captureError(error, { where: "linkEntityToLead" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function createDistributionTarget(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("manage_campaigns");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const input = {
      name: z.string().min(1).max(300).parse(formData.get("name")),
      target_type: z.string().min(1).parse(formData.get("targetType")),
      city: z.string().max(120).parse(formData.get("city") ?? "") || null,
      neighborhood: z.string().max(120).parse(formData.get("neighborhood") ?? "") || null,
      platform: z.string().max(120).parse(formData.get("platform") ?? "") || null,
      contact_person: z.string().max(200).parse(formData.get("contactPerson") ?? "") || null,
      contact_info: z.string().max(300).parse(formData.get("contactInfo") ?? "") || null,
      url: z.string().max(500).parse(formData.get("url") ?? "") || null,
      priority: z.enum(["routine", "important", "urgent"]).parse(formData.get("priority") ?? "routine"),
      created_by: session.userId,
    };

    const { data, error } = await supabase.from("distribution_targets").insert(input).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };

    await recordAuditEvent({
      actorId: session.userId,
      action: "create",
      entityType: "distribution_target",
      entityId: data.id,
      afterState: { name: input.name },
    });
    revalidatePath("/admin/distribution");
    return { ok: true, id: data.id };
  } catch (error) {
    captureError(error, { where: "createDistributionTarget" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function updateDistributionStatus(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("manage_campaigns");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const targetId = z.string().uuid().parse(formData.get("targetId"));
    const status = z
      .enum(["not_contacted", "contacted", "awaiting_response", "approved", "posted", "declined", "follow_up", "complete"])
      .parse(formData.get("status"));
    const update: Record<string, unknown> = { status };
    const lastContacted = formData.get("lastContacted")?.toString();
    const nextFollowUp = formData.get("nextFollowUp")?.toString();
    const publishedPostUrl = formData.get("publishedPostUrl")?.toString();
    const internalNotes = formData.get("internalNotes")?.toString();
    if (lastContacted) update.last_contacted = lastContacted;
    if (nextFollowUp) update.next_follow_up = nextFollowUp;
    if (publishedPostUrl) update.published_post_url = publishedPostUrl;
    if (internalNotes !== undefined) update.internal_notes = internalNotes;

    const { error } = await supabase.from("distribution_targets").update(update).eq("id", targetId);
    if (error) return { ok: false, error: error.message };

    await recordAuditEvent({
      actorId: session.userId,
      action: "update",
      entityType: "distribution_target",
      entityId: targetId,
      afterState: { status },
    });
    revalidatePath("/admin/distribution");
    return { ok: true };
  } catch (error) {
    captureError(error, { where: "updateDistributionStatus" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function createCampaign(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("manage_campaigns");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const name = z.string().min(1).max(200).parse(formData.get("name"));
    const slug = z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9-]+$/)
      .parse(formData.get("slug"));
    const targetId = formData.get("distributionTargetId")?.toString() || null;

    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        name,
        slug,
        distribution_target_id: targetId,
        created_by: session.userId,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };

    await recordAuditEvent({
      actorId: session.userId,
      action: "create",
      entityType: "campaign",
      entityId: data.id,
      afterState: { name, slug },
    });
    revalidatePath("/admin/campaigns");
    return { ok: true, id: data.id };
  } catch (error) {
    captureError(error, { where: "createCampaign" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function createTransmission(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("transmit_to_apd");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const recipientName = z.string().min(1).max(200).parse(formData.get("recipientName"));
    const method = z.enum(["email", "phone", "in_person", "portal", "mail", "other"]).parse(formData.get("method"));
    const summary = z.string().max(5000).parse(formData.get("summary") ?? "");
    const leadHumanIds = z
      .string()
      .parse(formData.get("leadHumanIds") ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);

    const { data: transmission, error } = await supabase
      .from("transmissions")
      .insert({
        recipient_name: recipientName,
        recipient_email: formData.get("recipientEmail")?.toString() || null,
        recipient_phone: formData.get("recipientPhone")?.toString() || null,
        method,
        summary,
        delivery_status: "draft",
        created_by: session.userId,
      })
      .select("id")
      .single();
    if (error || !transmission) return { ok: false, error: error?.message ?? "Insert failed" };

    for (const humanId of leadHumanIds) {
      const { data: lead } = await supabase.from("leads").select("id").eq("human_id", humanId).maybeSingle();
      if (lead) {
        await supabase.from("transmission_leads").insert({
          transmission_id: transmission.id,
          lead_id: lead.id,
          created_by: session.userId,
        });
        // Snapshot attachment hashes at transmission time.
        const { data: attachments } = await supabase
          .from("attachments")
          .select("id, sha256")
          .eq("lead_id", lead.id)
          .is("soft_deleted_at", null);
        for (const attachment of attachments ?? []) {
          await supabase.from("transmission_attachments").insert({
            transmission_id: transmission.id,
            attachment_id: attachment.id,
            sha256_at_transmission: attachment.sha256,
            created_by: session.userId,
          });
        }
      }
    }

    await recordAuditEvent({
      actorId: session.userId,
      action: "transmit",
      entityType: "transmission",
      entityId: transmission.id,
      afterState: { recipientName, method, leads: leadHumanIds },
      reason: "Transmission packet created (draft)",
    });
    revalidatePath("/admin/transmissions");
    return { ok: true, id: transmission.id };
  } catch (error) {
    captureError(error, { where: "createTransmission" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function updateTransmissionStatus(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("transmit_to_apd");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const transmissionId = z.string().uuid().parse(formData.get("transmissionId"));
    const status = z
      .enum(["draft", "prepared", "sent", "delivered", "acknowledged", "failed", "follow_up_required"])
      .parse(formData.get("status"));
    const referenceNumber = formData.get("referenceNumber")?.toString() || null;

    const update: Record<string, unknown> = {
      delivery_status: status,
      acknowledgment_received: status === "acknowledged",
    };
    if (referenceNumber) update.reference_number = referenceNumber;
    if (status === "sent") update.transmitted_at = new Date().toISOString();

    const { error } = await supabase.from("transmissions").update(update).eq("id", transmissionId);
    if (error) return { ok: false, error: error.message };

    // Mark linked leads as submitted only once delivery is confirmed —
    // "sent" is never represented as "received".
    if (status === "delivered" || status === "acknowledged") {
      const { data: links } = await supabase
        .from("transmission_leads")
        .select("lead_id")
        .eq("transmission_id", transmissionId);
      for (const link of links ?? []) {
        await supabase
          .from("leads")
          .update({
            status: "submitted_to_apd",
            apd_submitted_at: new Date().toISOString(),
            apd_reference: referenceNumber,
          })
          .eq("id", link.lead_id);
      }
    }

    await recordAuditEvent({
      actorId: session.userId,
      action: "transmit",
      entityType: "transmission",
      entityId: transmissionId,
      afterState: { status, referenceNumber },
    });
    revalidatePath("/admin/transmissions");
    return { ok: true };
  } catch (error) {
    captureError(error, { where: "updateTransmissionStatus" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function updateSiteSetting(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("manage_settings");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const key = z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .parse(formData.get("key"));
    const value = z.string().max(5000).parse(formData.get("value") ?? "");

    const { data: before } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
    const { error } = await supabase
      .from("site_settings")
      .update({ value })
      .eq("key", key);
    if (error) return { ok: false, error: error.message };

    await recordAuditEvent({
      actorId: session.userId,
      action: "settings_change",
      entityType: "site_setting",
      entityId: key,
      beforeState: { value: before?.value },
      afterState: { value },
    });
    revalidatePath("/admin/settings");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    captureError(error, { where: "updateSiteSetting" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function assignUserRole(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("manage_users");
    const admin = createSupabaseAdminClient();
    if (!admin) return { ok: false, error: "Service role unavailable" };

    const email = z.string().email().parse(formData.get("email"));
    const role = z.enum(["owner", "administrator", "reviewer", "outreach", "read_only"]).parse(
      formData.get("role"),
    );

    // Only the owner may grant the owner role.
    if (role === "owner" && session.role !== "owner") {
      return { ok: false, error: "Only the owner may grant the owner role" };
    }

    const { data: authUsers, error: listError } = await admin.auth.admin.listUsers();
    if (listError) return { ok: false, error: listError.message };
    const target = authUsers.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!target) {
      return { ok: false, error: "No auth user with that email — they must sign in once first" };
    }

    await admin.from("users").upsert({ id: target.id, email });
    const { error } = await admin
      .from("user_roles")
      .upsert({ user_id: target.id, role, created_by: session.userId }, { onConflict: "user_id" });
    if (error) return { ok: false, error: error.message };

    await recordAuditEvent({
      actorId: session.userId,
      action: "role_change",
      entityType: "user_role",
      entityId: target.id,
      afterState: { email, role },
    });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (error) {
    captureError(error, { where: "assignUserRole" });
    return { ok: false, error: "Unexpected error" };
  }
}

export async function reviewSource(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requirePermission("manage_sources");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const sourceId = z.string().uuid().parse(formData.get("sourceId"));
    const verificationStatus = z
      .enum(["unverified", "partially_verified", "verified", "disproved"])
      .parse(formData.get("verificationStatus"));
    const approved = formData.get("approved") === "on";
    const correctionNote = formData.get("correctionNote")?.toString() || null;

    const { error } = await supabase
      .from("sources")
      .update({
        verification_status: verificationStatus,
        approved,
        needs_verification: verificationStatus === "unverified",
        last_reviewed_at: new Date().toISOString(),
        correction_note: correctionNote,
      })
      .eq("id", sourceId);
    if (error) return { ok: false, error: error.message };

    await recordAuditEvent({
      actorId: session.userId,
      action: "update",
      entityType: "source",
      entityId: sourceId,
      afterState: { verificationStatus, approved },
    });
    revalidatePath("/admin/sources");
    revalidatePath("/sources");
    return { ok: true };
  } catch (error) {
    captureError(error, { where: "reviewSource" });
    return { ok: false, error: "Unexpected error" };
  }
}

// ---------------------------------------------------------------------------
// Void wrappers for direct <form action> usage in Server Components (React
// requires form actions to return void). Errors are captured/logged inside
// the underlying actions; pages re-render via revalidatePath.
// ---------------------------------------------------------------------------

export async function createEntityForm(formData: FormData): Promise<void> {
  await createEntity(formData);
}
export async function linkEntityToLeadForm(formData: FormData): Promise<void> {
  await linkEntityToLead(formData);
}
export async function createDistributionTargetForm(formData: FormData): Promise<void> {
  await createDistributionTarget(formData);
}
export async function updateDistributionStatusForm(formData: FormData): Promise<void> {
  await updateDistributionStatus(formData);
}
export async function createCampaignForm(formData: FormData): Promise<void> {
  await createCampaign(formData);
}
export async function createTransmissionForm(formData: FormData): Promise<void> {
  await createTransmission(formData);
}
export async function updateTransmissionStatusForm(formData: FormData): Promise<void> {
  await updateTransmissionStatus(formData);
}
export async function updateSiteSettingForm(formData: FormData): Promise<void> {
  await updateSiteSetting(formData);
}
export async function assignUserRoleForm(formData: FormData): Promise<void> {
  await assignUserRole(formData);
}
export async function reviewSourceForm(formData: FormData): Promise<void> {
  await reviewSource(formData);
}
