import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { getAdminSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Audit log CSV export — owner role only. The export itself is audited. */
export async function GET() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.role, "export_audit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: events, error } = await supabase
    .from("audit_events")
    .select("id, actor_id, action, entity_type, entity_id, reason, request_id, created_at")
    .order("created_at", { ascending: true })
    .limit(10000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditEvent({
    actorId: session.userId,
    action: "export",
    entityType: "audit_events",
    entityId: null,
    reason: "Owner exported audit log CSV",
  });

  const header = "id,actor_id,action,entity_type,entity_id,reason,request_id,created_at";
  const rows = (events ?? []).map((event) =>
    [
      event.id,
      event.actor_id,
      event.action,
      event.entity_type,
      event.entity_id,
      event.reason,
      event.request_id,
      event.created_at,
    ]
      .map(csvEscape)
      .join(","),
  );

  return new NextResponse([header, ...rows].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
