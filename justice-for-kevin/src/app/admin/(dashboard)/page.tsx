import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  const supabase = await createSupabaseServerClient();
  if (!session || !supabase) return null;

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [
    unreviewed,
    followUp,
    submitted,
    duplicates,
    newAttachments,
    contacted,
    posted,
    upcomingFollowUps,
    latestUpdate,
    recentAudit,
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "unreviewed").then((r) => r.count ?? 0),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "needs_follow_up").then((r) => r.count ?? 0),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "submitted_to_apd").then((r) => r.count ?? 0),
    supabase.from("lead_duplicate_suggestions").select("id", { count: "exact", head: true }).eq("status", "suggested").then((r) => r.count ?? 0),
    supabase.from("attachments").select("id", { count: "exact", head: true }).gte("created_at", weekAgo).then((r) => r.count ?? 0),
    supabase.from("distribution_targets").select("id", { count: "exact", head: true }).neq("status", "not_contacted").then((r) => r.count ?? 0),
    supabase.from("distribution_targets").select("id", { count: "exact", head: true }).eq("status", "posted").then((r) => r.count ?? 0),
    supabase
      .from("distribution_targets")
      .select("id, name, next_follow_up")
      .not("next_follow_up", "is", null)
      .gte("next_follow_up", new Date().toISOString().slice(0, 10))
      .order("next_follow_up", { ascending: true })
      .limit(5)
      .then((r) => r.data ?? []),
    supabase
      .from("official_updates")
      .select("id, title, published_at")
      .eq("kind", "update")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r) => r.data),
    hasPermission(session.role, "view_audit")
      ? supabase
          .from("audit_events")
          .select("id, action, entity_type, created_at")
          .order("created_at", { ascending: false })
          .limit(8)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const widgets = [
    { label: "Unreviewed leads", value: unreviewed, href: "/admin/leads?status=unreviewed" },
    { label: "Leads awaiting follow-up", value: followUp, href: "/admin/leads?status=needs_follow_up" },
    { label: "Leads transmitted to APD", value: submitted, href: "/admin/leads?status=submitted_to_apd" },
    { label: "Potential duplicates", value: duplicates, href: "/admin/leads" },
    { label: "New attachments (7d)", value: newAttachments, href: "/admin/files" },
    { label: "Outreach targets contacted", value: contacted, href: "/admin/distribution" },
    { label: "Published campaign posts", value: posted, href: "/admin/distribution?status=posted" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {widgets.map((widget) => (
          <Link key={widget.label} href={widget.href}>
            <Card className="h-full transition-colors hover:border-steel-600">
              <CardContent className="pt-5">
                <p className="text-3xl font-bold tabular-nums">{widget.value}</p>
                <p className="mt-1 text-sm text-charcoal-600">{widget.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-semibold">Upcoming follow-ups</h2>
            {upcomingFollowUps.length === 0 ? (
              <p className="mt-2 text-sm text-charcoal-500">None scheduled.</p>
            ) : (
              <ul className="mt-2 divide-y divide-charcoal-100 text-sm">
                {upcomingFollowUps.map((target) => (
                  <li key={target.id} className="flex justify-between py-2">
                    <span>{target.name}</span>
                    <span className="tabular-nums text-charcoal-500">{target.next_follow_up}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <h2 className="font-semibold">Latest official source update</h2>
            {latestUpdate ? (
              <p className="mt-2 text-sm">
                {latestUpdate.title}{" "}
                <span className="text-charcoal-500">
                  ({new Date(latestUpdate.published_at).toLocaleDateString()})
                </span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-charcoal-500">No updates recorded yet.</p>
            )}

            {recentAudit.length > 0 ? (
              <>
                <h2 className="mt-5 font-semibold">Recent audit activity</h2>
                <ul className="mt-2 divide-y divide-charcoal-100 text-sm">
                  {recentAudit.map((event) => (
                    <li key={event.id} className="flex justify-between gap-3 py-1.5">
                      <span className="truncate">
                        {event.action} · {event.entity_type}
                      </span>
                      <span className="shrink-0 tabular-nums text-charcoal-500">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
