import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDistributionTargetForm, updateDistributionStatusForm } from "../actions";

export const dynamic = "force-dynamic";

const TARGET_TYPES = [
  "facebook_group",
  "nextdoor_neighborhood",
  "local_business",
  "apartment_complex",
  "church",
  "community_organization",
  "news_outlet",
  "school",
  "bar_restaurant",
  "transit_location",
  "shelter",
  "union",
  "veterans_organization",
  "other",
];

const STATUSES = [
  "not_contacted",
  "contacted",
  "awaiting_response",
  "approved",
  "posted",
  "declined",
  "follow_up",
  "complete",
];

export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; city?: string }>;
}) {
  const [session, supabase, params] = await Promise.all([
    getAdminSession(),
    createSupabaseServerClient(),
    searchParams,
  ]);
  if (!session || !supabase) return null;

  let query = supabase
    .from("distribution_targets")
    .select("*")
    .order("city", { ascending: true })
    .order("name", { ascending: true })
    .limit(300);
  if (params.status) query = query.eq("status", params.status);
  if (params.city) query = query.ilike("city", `%${params.city}%`);
  const { data: targets } = await query;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Campaign distribution</h1>
      <p className="mt-1 text-sm text-charcoal-600">
        Private outreach tracker. Contact information here is never publicly revealed.
      </p>

      <Card className="mt-5">
        <CardContent className="pt-5">
          <h2 className="font-semibold">New target</h2>
          <form action={createDistributionTargetForm} className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <input name="name" required placeholder="Name *" aria-label="Name" className="h-11 rounded-md border border-charcoal-300 px-3 text-sm" />
            <select name="targetType" aria-label="Type" className="h-11 rounded-md border border-charcoal-300 bg-white px-2 text-sm">
              {TARGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <input name="city" placeholder="City" aria-label="City" className="h-11 rounded-md border border-charcoal-300 px-3 text-sm" />
            <input name="neighborhood" placeholder="Neighborhood" aria-label="Neighborhood" className="h-11 rounded-md border border-charcoal-300 px-3 text-sm" />
            <input name="platform" placeholder="Platform" aria-label="Platform" className="h-11 rounded-md border border-charcoal-300 px-3 text-sm" />
            <input name="contactPerson" placeholder="Contact person" aria-label="Contact person" className="h-11 rounded-md border border-charcoal-300 px-3 text-sm" />
            <input name="contactInfo" placeholder="Contact info" aria-label="Contact info" className="h-11 rounded-md border border-charcoal-300 px-3 text-sm" />
            <input name="url" placeholder="URL" aria-label="URL" className="h-11 rounded-md border border-charcoal-300 px-3 text-sm" />
            <select name="priority" aria-label="Priority" className="h-11 rounded-md border border-charcoal-300 bg-white px-2 text-sm">
              {["routine", "important", "urgent"].map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
            <button type="submit" className="h-11 rounded-md bg-steel-600 px-4 text-sm font-medium text-white hover:bg-steel-700">
              Add target
            </button>
          </form>
        </CardContent>
      </Card>

      <form className="mt-5 flex flex-wrap gap-2" action="/admin/distribution" method="get">
        <select name="status" defaultValue={params.status ?? ""} aria-label="Status filter" className="h-10 rounded-md border border-charcoal-300 bg-white px-2 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <input name="city" defaultValue={params.city ?? ""} placeholder="City" aria-label="City filter" className="h-10 rounded-md border border-charcoal-300 px-3 text-sm" />
        <button type="submit" className="h-10 rounded-md bg-charcoal-900 px-4 text-sm font-medium text-white">
          Filter
        </button>
      </form>

      <div className="mt-4 space-y-3">
        {(targets ?? []).map((target) => (
          <Card key={target.id}>
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{target.name}</h3>
                <Badge variant="neutral">{target.target_type.replaceAll("_", " ")}</Badge>
                <Badge variant="status">{target.status.replaceAll("_", " ")}</Badge>
                {target.city ? <span className="text-sm text-charcoal-500">{target.city}{target.neighborhood ? ` · ${target.neighborhood}` : ""}</span> : null}
                {target.priority !== "routine" ? <Badge variant="warning">{target.priority}</Badge> : null}
              </div>
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-charcoal-500">
                {target.contact_person ? <div>Contact: {target.contact_person}</div> : null}
                {target.last_contacted ? <div>Last contacted: {target.last_contacted}</div> : null}
                {target.next_follow_up ? <div>Next follow-up: {target.next_follow_up}</div> : null}
                {target.published_post_url ? <div>Posted: {target.published_post_url}</div> : null}
              </dl>
              <form action={updateDistributionStatusForm} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="targetId" value={target.id} />
                <select name="status" defaultValue={target.status} aria-label={`Status for ${target.name}`} className="h-9 rounded-md border border-charcoal-300 bg-white px-2 text-sm">
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <input type="date" name="lastContacted" aria-label="Last contacted" className="h-9 rounded-md border border-charcoal-300 px-2 text-sm" />
                <input type="date" name="nextFollowUp" aria-label="Next follow-up" className="h-9 rounded-md border border-charcoal-300 px-2 text-sm" />
                <input name="publishedPostUrl" placeholder="Published post URL" aria-label="Published post URL" className="h-9 w-52 rounded-md border border-charcoal-300 px-2 text-sm" />
                <button type="submit" className="h-9 rounded-md bg-charcoal-900 px-3 text-sm font-medium text-white">
                  Update
                </button>
              </form>
            </CardContent>
          </Card>
        ))}
        {(targets ?? []).length === 0 ? (
          <p className="p-6 text-center text-charcoal-500">No distribution targets yet.</p>
        ) : null}
      </div>
    </div>
  );
}
