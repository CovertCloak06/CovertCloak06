import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { linkEntityToLeadForm } from "../../actions";

export const dynamic = "force-dynamic";

const RELATIONSHIPS = [
  "mentioned_in",
  "associated_with",
  "observed_at",
  "owns",
  "operates",
  "uses",
  "works_at",
  "seen_with",
  "possibly_same_as",
  "duplicate_of",
];

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, supabase, { id }] = await Promise.all([
    getAdminSession(),
    createSupabaseServerClient(),
    params,
  ]);
  if (!session || !supabase) return null;

  const { data: entity } = await supabase.from("entities").select("*").eq("id", id).maybeSingle();
  if (!entity) notFound();

  const [links, relationships] = await Promise.all([
    supabase
      .from("lead_entities")
      .select("id, relationship, confidence, created_at, leads (id, human_id, title)")
      .eq("entity_id", id)
      .then((r) => r.data ?? []),
    supabase
      .from("entity_relationships")
      .select("id, relationship, confidence, independently_corroborated, machine_generated, created_at, from_entity_id, to_entity_id")
      .or(`from_entity_id.eq.${id},to_entity_id.eq.${id}`)
      .then((r) => r.data ?? []),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="neutral">{entity.type.replaceAll("_", " ")}</Badge>
        <h1 className="mt-1 text-2xl font-semibold">{entity.display_name}</h1>
        <p className="font-mono text-sm text-charcoal-500">{entity.normalized_value}</p>
        <p className="mt-2 text-sm">
          Verification: <strong>{entity.verification_status.replaceAll("_", " ")}</strong> · Never
          publicly visible
        </p>
        {entity.description ? <p className="mt-2 text-charcoal-700">{entity.description}</p> : null}
      </div>

      <Card>
        <CardContent className="pt-5">
          <h2 className="font-semibold">Link to a lead</h2>
          <form action={linkEntityToLeadForm} className="mt-3 grid gap-3 sm:grid-cols-[10rem_12rem_10rem_auto]">
            <input type="hidden" name="entityId" value={entity.id} />
            <input
              name="leadHumanId"
              required
              placeholder="Lead ID (L-000001)"
              aria-label="Lead human ID"
              className="h-11 rounded-md border border-charcoal-300 bg-white px-3 text-sm"
            />
            <select
              name="relationship"
              aria-label="Relationship"
              className="h-11 rounded-md border border-charcoal-300 bg-white px-2 text-sm"
            >
              {RELATIONSHIPS.map((relationship) => (
                <option key={relationship} value={relationship}>
                  {relationship.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <select
              name="confidence"
              aria-label="Confidence"
              className="h-11 rounded-md border border-charcoal-300 bg-white px-2 text-sm"
            >
              {["stated", "probable", "uncertain"].map((confidence) => (
                <option key={confidence} value={confidence}>
                  {confidence}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-11 rounded-md bg-steel-600 px-4 text-sm font-medium text-white hover:bg-steel-700"
            >
              Link
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="font-semibold">Linked leads ({links.length})</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {links.map((link) => {
              const lead = Array.isArray(link.leads) ? link.leads[0] : link.leads;
              if (!lead) return null;
              return (
                <li key={link.id} className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/admin/leads/${lead.id}`}
                    className="font-mono text-xs text-steel-700 underline-offset-2 hover:underline"
                  >
                    {lead.human_id}
                  </a>
                  <span>{lead.title}</span>
                  <span className="text-xs text-charcoal-500">
                    {link.relationship.replaceAll("_", " ")} · {link.confidence} ·{" "}
                    {new Date(link.created_at).toLocaleDateString()}
                  </span>
                </li>
              );
            })}
            {links.length === 0 ? <li className="text-charcoal-500">None.</li> : null}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="font-semibold">Entity relationships ({relationships.length})</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {relationships.map((relationship) => (
              <li key={relationship.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-charcoal-500">
                  {relationship.from_entity_id === entity.id ? "→" : "←"}{" "}
                  {relationship.from_entity_id === entity.id
                    ? relationship.to_entity_id
                    : relationship.from_entity_id}
                </span>
                <Badge variant="neutral">{relationship.relationship.replaceAll("_", " ")}</Badge>
                <span className="text-xs text-charcoal-500">
                  {relationship.confidence}
                  {relationship.independently_corroborated ? " · corroborated" : ""}
                </span>
                {relationship.machine_generated ? (
                  <Badge variant="warning">machine-generated suggestion</Badge>
                ) : null}
              </li>
            ))}
            {relationships.length === 0 ? <li className="text-charcoal-500">None.</li> : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
