import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createEntityForm } from "../actions";

export const dynamic = "force-dynamic";

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
];

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  const [session, supabase, params] = await Promise.all([
    getAdminSession(),
    createSupabaseServerClient(),
    searchParams,
  ]);
  if (!session || !supabase) return null;

  let query = supabase
    .from("entities")
    .select("id, type, display_name, normalized_value, verification_status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (params.type) query = query.eq("type", params.type);
  if (params.q) query = query.ilike("display_name", `%${params.q}%`);
  const { data: entities } = await query;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Entity index</h1>
      <p className="mt-1 text-sm text-charcoal-600">
        Private structured index. Entities are never publicly visible and are never
        labeled as suspects.
      </p>

      <Card className="mt-5">
        <CardContent className="pt-5">
          <h2 className="font-semibold">New entity</h2>
          <form action={createEntityForm} className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr_1fr_auto]">
            <select
              name="type"
              aria-label="Entity type"
              className="h-11 rounded-md border border-charcoal-300 bg-white px-2 text-sm"
            >
              {ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <input
              name="displayName"
              required
              placeholder="Display name / value"
              aria-label="Display name"
              className="h-11 rounded-md border border-charcoal-300 bg-white px-3 text-sm"
            />
            <input
              name="description"
              placeholder="Description (optional)"
              aria-label="Description"
              className="h-11 rounded-md border border-charcoal-300 bg-white px-3 text-sm"
            />
            <button
              type="submit"
              className="h-11 rounded-md bg-steel-600 px-4 text-sm font-medium text-white hover:bg-steel-700"
            >
              Add
            </button>
          </form>
        </CardContent>
      </Card>

      <form className="mt-5 flex flex-wrap gap-2" action="/admin/entities" method="get">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search entities…"
          aria-label="Search entities"
          className="h-10 rounded-md border border-charcoal-300 bg-white px-3 text-sm"
        />
        <select
          name="type"
          defaultValue={params.type ?? ""}
          aria-label="Type filter"
          className="h-10 rounded-md border border-charcoal-300 bg-white px-2 text-sm"
        >
          <option value="">All types</option>
          {ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-md bg-charcoal-900 px-4 text-sm font-medium text-white">
          Filter
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-charcoal-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-charcoal-200 bg-charcoal-50 text-left">
            <tr>
              <th scope="col" className="p-3 font-semibold">Type</th>
              <th scope="col" className="p-3 font-semibold">Name</th>
              <th scope="col" className="p-3 font-semibold">Normalized</th>
              <th scope="col" className="p-3 font-semibold">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {(entities ?? []).map((entity) => (
              <tr key={entity.id} className="hover:bg-charcoal-50">
                <td className="p-3">
                  <Badge variant="neutral">{entity.type.replaceAll("_", " ")}</Badge>
                </td>
                <td className="p-3">
                  <Link
                    href={`/admin/entities/${entity.id}`}
                    className="text-steel-700 underline-offset-2 hover:underline"
                  >
                    {entity.display_name}
                  </Link>
                </td>
                <td className="p-3 font-mono text-xs text-charcoal-500">{entity.normalized_value}</td>
                <td className="p-3">{entity.verification_status.replaceAll("_", " ")}</td>
              </tr>
            ))}
            {(entities ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-charcoal-500">
                  No entities yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
