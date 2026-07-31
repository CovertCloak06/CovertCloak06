import "server-only";
import { sha256HexOfText } from "@/lib/hash";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type AuditAction =
  | "create"
  | "view_sensitive_record"
  | "update"
  | "soft_delete"
  | "restore"
  | "download_private_attachment"
  | "generate_signed_url"
  | "export"
  | "transmit"
  | "login"
  | "role_change"
  | "settings_change";

export type AuditEvent = {
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string;
  requestId?: string;
  ip?: string | null;
};

/**
 * Append-only audit trail. Rows are written with the service role because
 * RLS forbids INSERT/UPDATE/DELETE on audit_events for every user role —
 * even administrators cannot edit history (enforced by policy + trigger).
 * IPs are stored only as salted SHA-256 hashes.
 */
export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    // Without infrastructure we still avoid silently losing the trail.
    console.warn("[audit] Supabase not configured; event not persisted:", event.action, event.entityType);
    return;
  }

  const ipHash = event.ip
    ? await sha256HexOfText(`${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 8) ?? "salt"}:${event.ip}`)
    : null;

  const { error } = await admin.from("audit_events").insert({
    actor_id: event.actorId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    before_state: event.beforeState ?? null,
    after_state: event.afterState ?? null,
    reason: event.reason ?? null,
    request_id: event.requestId ?? null,
    ip_hash: ipHash,
  });

  if (error) {
    console.error("[audit] failed to record event:", error.message);
  }
}
