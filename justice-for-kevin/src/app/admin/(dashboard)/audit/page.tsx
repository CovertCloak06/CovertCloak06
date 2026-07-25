import { Badge } from "@/components/ui/badge";
import { getAdminSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const [session, supabase] = await Promise.all([
    getAdminSession(),
    createSupabaseServerClient(),
  ]);
  if (!session || !supabase) return null;

  if (!hasPermission(session.role, "view_audit")) {
    return (
      <p role="alert" className="rounded border border-urgent-700 bg-urgent-100 p-4">
        Your role does not have access to audit records.
      </p>
    );
  }

  const { data: events } = await supabase
    .from("audit_events")
    .select("id, actor_id, action, entity_type, entity_id, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        {hasPermission(session.role, "export_audit") ? (
          <a
            href="/admin/audit/export"
            className="rounded-md border border-charcoal-300 bg-white px-4 py-2 text-sm font-medium hover:bg-charcoal-100"
          >
            Export CSV (owner only)
          </a>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-charcoal-600">
        Append-only. No role — including administrators — can modify or delete
        historical audit records; this is enforced by RLS and a database trigger.
      </p>

      <div className="mt-5 overflow-x-auto rounded-lg border border-charcoal-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-charcoal-200 bg-charcoal-50 text-left">
            <tr>
              <th scope="col" className="p-3 font-semibold">Time</th>
              <th scope="col" className="p-3 font-semibold">Action</th>
              <th scope="col" className="p-3 font-semibold">Entity</th>
              <th scope="col" className="p-3 font-semibold">Actor</th>
              <th scope="col" className="p-3 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {(events ?? []).map((event) => (
              <tr key={event.id}>
                <td className="whitespace-nowrap p-3 tabular-nums text-charcoal-500">
                  {new Date(event.created_at).toLocaleString()}
                </td>
                <td className="p-3">
                  <Badge variant="neutral">{event.action.replaceAll("_", " ")}</Badge>
                </td>
                <td className="p-3">
                  {event.entity_type}
                  {event.entity_id ? (
                    <span className="font-mono text-xs text-charcoal-500"> {event.entity_id.slice(0, 8)}…</span>
                  ) : null}
                </td>
                <td className="p-3 font-mono text-xs text-charcoal-500">
                  {event.actor_id ? `${event.actor_id.slice(0, 8)}…` : "system/public"}
                </td>
                <td className="max-w-64 truncate p-3 text-charcoal-600">{event.reason ?? "—"}</td>
              </tr>
            ))}
            {(events ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-charcoal-500">
                  No audit events.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
