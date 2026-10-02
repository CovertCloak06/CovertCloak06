import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewLeadForm } from "./new-lead-form";

export const dynamic = "force-dynamic";

const STATUSES = [
  "unreviewed",
  "needs_follow_up",
  "insufficient_detail",
  "submitted_to_apd",
  "corroborated",
  "duplicate",
  "closed",
  "retain",
] as const;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; classification?: string }>;
}) {
  const [session, supabase, params] = await Promise.all([
    getAdminSession(),
    createSupabaseServerClient(),
    searchParams,
  ]);
  if (!session || !supabase) return null;

  let query = supabase
    .from("leads")
    .select(
      "id, human_id, title, status, priority, source_classification, intake_channel, anonymous, created_at, tags",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.status && (STATUSES as readonly string[]).includes(params.status)) {
    query = query.eq("status", params.status);
  }
  if (params.classification) {
    query = query.eq("source_classification", params.classification);
  }
  if (params.q) {
    query = query.textSearch("search", params.q, { type: "websearch" });
  }

  const { data: leads, error } = await query;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <NewLeadForm />
      </div>

      <form className="mt-4 flex flex-wrap gap-2" action="/admin/leads" method="get">
        <label className="sr-only" htmlFor="leads-q">
          Search leads
        </label>
        <input
          id="leads-q"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search leads…"
          className="h-10 rounded-md border border-charcoal-300 bg-white px-3 text-sm"
        />
        <label className="sr-only" htmlFor="leads-status">
          Status filter
        </label>
        <select
          id="leads-status"
          name="status"
          defaultValue={params.status ?? ""}
          className="h-10 rounded-md border border-charcoal-300 bg-white px-2 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 rounded-md bg-charcoal-900 px-4 text-sm font-medium text-white"
        >
          Filter
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-urgent-700">
          {error.message}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-lg border border-charcoal-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-charcoal-200 bg-charcoal-50 text-left">
            <tr>
              <th scope="col" className="p-3 font-semibold">ID</th>
              <th scope="col" className="p-3 font-semibold">Title</th>
              <th scope="col" className="p-3 font-semibold">Status</th>
              <th scope="col" className="p-3 font-semibold">Priority</th>
              <th scope="col" className="p-3 font-semibold">Source</th>
              <th scope="col" className="p-3 font-semibold">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {(leads ?? []).map((lead) => (
              <tr key={lead.id} className="hover:bg-charcoal-50">
                <td className="p-3 font-mono text-xs">
                  <Link href={`/admin/leads/${lead.id}`} className="text-steel-700 underline-offset-2 hover:underline">
                    {lead.human_id}
                  </Link>
                </td>
                <td className="max-w-72 truncate p-3">{lead.title}</td>
                <td className="p-3">
                  <Badge variant="status">{lead.status.replaceAll("_", " ")}</Badge>
                </td>
                <td className="p-3">{lead.priority}</td>
                <td className="p-3">{lead.source_classification}</td>
                <td className="whitespace-nowrap p-3 tabular-nums text-charcoal-500">
                  {new Date(lead.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {(leads ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-charcoal-500">
                  No leads match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
