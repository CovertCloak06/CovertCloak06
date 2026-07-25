import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCampaignForm } from "../actions";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const [session, supabase] = await Promise.all([
    getAdminSession(),
    createSupabaseServerClient(),
  ]);
  if (!session || !supabase) return null;

  const [{ data: campaigns }, { data: targets }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, distribution_targets (name)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("distribution_targets").select("id, name").order("name"),
  ]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://justiceforkevin.org";

  return (
    <div>
      <h1 className="text-2xl font-semibold">Campaign QR tracking</h1>
      <p className="mt-1 text-sm text-charcoal-600">
        Each campaign slug produces a trackable link:{" "}
        <code className="rounded bg-charcoal-100 px-1.5 py-0.5 text-xs">
          {siteUrl}/witness?src=&lt;slug&gt;
        </code>
        . Scan tracking is aggregate-only (count, first/last scan, coarse referrer).
      </p>

      <Card className="mt-5">
        <CardContent className="pt-5">
          <h2 className="font-semibold">New campaign</h2>
          <form action={createCampaignForm} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input
              name="name"
              required
              placeholder="Name *"
              aria-label="Campaign name"
              className="h-11 rounded-md border border-charcoal-300 px-3 text-sm"
            />
            <input
              name="slug"
              required
              pattern="[a-z0-9-]+"
              placeholder="slug (flyer-antioch-market-001)"
              aria-label="Campaign slug"
              className="h-11 rounded-md border border-charcoal-300 px-3 font-mono text-sm"
            />
            <select
              name="distributionTargetId"
              aria-label="Distribution target"
              className="h-11 rounded-md border border-charcoal-300 bg-white px-2 text-sm"
            >
              <option value="">No linked target</option>
              {(targets ?? []).map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-11 rounded-md bg-steel-600 px-4 text-sm font-medium text-white hover:bg-steel-700"
            >
              Create
            </button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-5 overflow-x-auto rounded-lg border border-charcoal-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-charcoal-200 bg-charcoal-50 text-left">
            <tr>
              <th scope="col" className="p-3 font-semibold">Campaign</th>
              <th scope="col" className="p-3 font-semibold">Slug</th>
              <th scope="col" className="p-3 font-semibold">Target</th>
              <th scope="col" className="p-3 font-semibold">Scans</th>
              <th scope="col" className="p-3 font-semibold">First scan</th>
              <th scope="col" className="p-3 font-semibold">Last scan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {(campaigns ?? []).map((campaign) => {
              const target = Array.isArray(campaign.distribution_targets)
                ? campaign.distribution_targets[0]
                : campaign.distribution_targets;
              return (
                <tr key={campaign.id}>
                  <td className="p-3">{campaign.name}</td>
                  <td className="p-3 font-mono text-xs">{campaign.slug}</td>
                  <td className="p-3">{target?.name ?? "—"}</td>
                  <td className="p-3 tabular-nums">{campaign.scan_count}</td>
                  <td className="p-3 tabular-nums text-charcoal-500">
                    {campaign.first_scan_at ? new Date(campaign.first_scan_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-3 tabular-nums text-charcoal-500">
                    {campaign.last_scan_at ? new Date(campaign.last_scan_at).toLocaleString() : "—"}
                  </td>
                </tr>
              );
            })}
            {(campaigns ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-charcoal-500">
                  No campaigns yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
