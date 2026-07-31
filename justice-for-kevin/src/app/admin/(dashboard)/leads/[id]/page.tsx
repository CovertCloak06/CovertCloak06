import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatBytes } from "@/lib/utils";
import { AttachmentDownload } from "./attachment-download";
import { LeadForms } from "./lead-forms";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
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

  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  const [notes, history, attachments, leadEntities, duplicates, transmissions] = await Promise.all([
    supabase.from("lead_notes").select("*").eq("lead_id", id).order("created_at", { ascending: false }).then((r) => r.data ?? []),
    supabase.from("lead_status_history").select("*").eq("lead_id", id).order("created_at", { ascending: false }).then((r) => r.data ?? []),
    supabase.from("attachments").select("*").eq("lead_id", id).is("soft_deleted_at", null).then((r) => r.data ?? []),
    supabase
      .from("lead_entities")
      .select("id, relationship, confidence, entities (id, type, display_name, verification_status)")
      .eq("lead_id", id)
      .then((r) => r.data ?? []),
    supabase
      .from("lead_duplicate_suggestions")
      .select("id, candidate_lead_id, score, reasons, status")
      .eq("lead_id", id)
      .then((r) => r.data ?? []),
    supabase
      .from("transmission_leads")
      .select("transmission_id, transmissions (id, recipient_name, method, delivery_status, transmitted_at, reference_number)")
      .eq("lead_id", id)
      .then((r) => r.data ?? []),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-sm text-charcoal-500">{lead.human_id}</p>
        <h1 className="text-2xl font-semibold">{lead.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="status">{lead.status.replaceAll("_", " ")}</Badge>
          <Badge variant="neutral">priority: {lead.priority}</Badge>
          <Badge variant="neutral">{lead.source_classification}</Badge>
          <Badge variant="neutral">via {lead.intake_channel.replaceAll("_", " ")}</Badge>
          {lead.anonymous ? <Badge variant="warning">anonymous</Badge> : null}
          {(lead.tags ?? []).map((tag: string) => (
            <Badge key={tag} variant="neutral">
              #{tag}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-5">
              <h2 className="font-semibold">Original narrative (immutable)</h2>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-charcoal-100 bg-charcoal-50 p-3 font-mono text-xs leading-relaxed">
                {lead.original_narrative}
              </pre>
              <p className="mt-2 text-xs text-charcoal-500">
                Received {new Date(lead.received_at).toLocaleString()} · The original submission
                can never be edited or overwritten.
              </p>
            </CardContent>
          </Card>

          <LeadForms
            leadId={lead.id}
            currentStatus={lead.status}
            currentPriority={lead.priority}
            summary={lead.summary ?? ""}
            normalizedNarrative={lead.normalized_narrative ?? ""}
            tags={(lead.tags ?? []).join(", ")}
          />

          <Card>
            <CardContent className="pt-5">
              <h2 className="font-semibold">Attachments ({attachments.length})</h2>
              {attachments.length === 0 ? (
                <p className="mt-2 text-sm text-charcoal-500">No attachments.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {attachments.map((attachment) => (
                    <li
                      key={attachment.id}
                      className="flex items-center justify-between gap-3 rounded border border-charcoal-200 p-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{attachment.original_filename}</p>
                        <p className="truncate font-mono text-xs text-charcoal-500">
                          {formatBytes(attachment.size_bytes)} · sha256:{attachment.sha256.slice(0, 20)}… ·
                          scan: {attachment.virus_scan_status}
                        </p>
                      </div>
                      <AttachmentDownload attachmentId={attachment.id} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {!lead.anonymous ? (
            <Card>
              <CardContent className="pt-5">
                <h2 className="font-semibold">Submitter</h2>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex gap-2"><dt className="font-medium">Name:</dt><dd>{lead.submitter_name ?? "—"}</dd></div>
                  <div className="flex gap-2"><dt className="font-medium">Phone:</dt><dd>{lead.submitter_phone ?? "—"}</dd></div>
                  <div className="flex gap-2"><dt className="font-medium">Email:</dt><dd>{lead.submitter_email ?? "—"}</dd></div>
                </dl>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="pt-5">
              <h2 className="font-semibold">Related entities</h2>
              {leadEntities.length === 0 ? (
                <p className="mt-2 text-sm text-charcoal-500">
                  None linked. Link entities from the Entities page.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {leadEntities.map((link) => {
                    const entity = Array.isArray(link.entities) ? link.entities[0] : link.entities;
                    if (!entity) return null;
                    return (
                      <li key={link.id} className="flex flex-wrap items-center gap-2">
                        <Badge variant="neutral">{entity.type}</Badge>
                        <a
                          className="text-steel-700 underline-offset-2 hover:underline"
                          href={`/admin/entities/${entity.id}`}
                        >
                          {entity.display_name}
                        </a>
                        <span className="text-xs text-charcoal-500">
                          {link.relationship} · {link.confidence}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h2 className="font-semibold">Duplicate candidates</h2>
              {duplicates.length === 0 ? (
                <p className="mt-2 text-sm text-charcoal-500">No suggestions.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {duplicates.map((duplicate) => (
                    <li key={duplicate.id} className="rounded border border-charcoal-200 p-2.5">
                      <a
                        className="font-mono text-xs text-steel-700 underline-offset-2 hover:underline"
                        href={`/admin/leads/${duplicate.candidate_lead_id}`}
                      >
                        {duplicate.candidate_lead_id}
                      </a>
                      <p className="mt-1 text-xs text-charcoal-500">
                        score {duplicate.score} · {(duplicate.reasons ?? []).join(", ")} ·{" "}
                        <strong>{duplicate.status}</strong> (human confirmation required)
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h2 className="font-semibold">APD transmission history</h2>
              {transmissions.length === 0 ? (
                <p className="mt-2 text-sm text-charcoal-500">
                  Not included in any transmission yet.
                </p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {transmissions.map((row) => {
                    const transmission = Array.isArray(row.transmissions)
                      ? row.transmissions[0]
                      : row.transmissions;
                    if (!transmission) return null;
                    return (
                      <li key={row.transmission_id} className="rounded border border-charcoal-200 p-2.5">
                        <p className="font-medium">
                          {transmission.recipient_name} · {transmission.method}
                        </p>
                        <p className="text-xs text-charcoal-500">
                          {transmission.delivery_status}
                          {transmission.transmitted_at
                            ? ` · ${new Date(transmission.transmitted_at).toLocaleString()}`
                            : ""}
                          {transmission.reference_number ? ` · ref ${transmission.reference_number}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h2 className="font-semibold">Status history</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <span className="font-medium">{entry.to_status.replaceAll("_", " ")}</span>
                    {entry.from_status ? (
                      <span className="text-charcoal-500"> (from {entry.from_status.replaceAll("_", " ")})</span>
                    ) : null}
                    <span className="text-xs text-charcoal-500">
                      {" "}
                      · {new Date(entry.created_at).toLocaleString()}
                    </span>
                    {entry.reason ? <p className="text-xs text-charcoal-600">{entry.reason}</p> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h2 className="font-semibold">Internal notes ({notes.length})</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {notes.map((note) => (
                  <li key={note.id} className="rounded border border-charcoal-200 p-2.5">
                    {note.sensitive ? <Badge variant="warning">sensitive</Badge> : null}
                    <p className="mt-1 whitespace-pre-wrap">{note.body}</p>
                    <p className="mt-1 text-xs text-charcoal-500">
                      {new Date(note.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
