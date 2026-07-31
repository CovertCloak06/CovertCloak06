import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reviewSourceForm } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminSourcesPage() {
  const [session, supabase] = await Promise.all([
    getAdminSession(),
    createSupabaseServerClient(),
  ]);
  if (!session || !supabase) return null;

  const { data: sources } = await supabase
    .from("sources")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Sources</h1>
      <p className="mt-1 text-sm text-charcoal-600">
        Only approved sources appear publicly. Placeholders seeded with
        &ldquo;Replace with verified source&rdquo; must be verified before approval.
      </p>

      <div className="mt-5 space-y-4">
        {(sources ?? []).map((source) => (
          <Card key={source.id} className={source.needs_verification ? "border-urgent-700" : ""}>
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{source.title}</h2>
                <Badge variant="neutral">{source.source_type.replaceAll("_", " ")}</Badge>
                <Badge variant="status">{source.verification_status.replaceAll("_", " ")}</Badge>
                {source.approved ? (
                  <Badge variant="law_enforcement">public</Badge>
                ) : (
                  <Badge variant="neutral">not public</Badge>
                )}
                {source.needs_verification ? (
                  <Badge variant="warning">requires verification</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-charcoal-600">
                {source.publisher}
                {source.original_url ? ` · ${source.original_url}` : ""}
                {source.last_reviewed_at
                  ? ` · last reviewed ${new Date(source.last_reviewed_at).toLocaleDateString()}`
                  : " · never reviewed"}
              </p>
              {source.summary ? <p className="mt-2 text-sm">{source.summary}</p> : null}

              <form action={reviewSourceForm} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="sourceId" value={source.id} />
                <select
                  name="verificationStatus"
                  defaultValue={source.verification_status}
                  aria-label={`Verification status for ${source.title}`}
                  className="h-9 rounded-md border border-charcoal-300 bg-white px-2 text-sm"
                >
                  {["unverified", "partially_verified", "verified", "disproved"].map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="approved" defaultChecked={source.approved} /> Public
                </label>
                <input
                  name="correctionNote"
                  placeholder="Correction note (optional)"
                  aria-label="Correction note"
                  defaultValue={source.correction_note ?? ""}
                  className="h-9 w-64 rounded-md border border-charcoal-300 px-2 text-sm"
                />
                <button
                  type="submit"
                  className="h-9 rounded-md bg-charcoal-900 px-3 text-sm font-medium text-white"
                >
                  Save review
                </button>
              </form>
            </CardContent>
          </Card>
        ))}
        {(sources ?? []).length === 0 ? (
          <p className="p-6 text-center text-charcoal-500">No sources recorded.</p>
        ) : null}
      </div>
    </div>
  );
}
