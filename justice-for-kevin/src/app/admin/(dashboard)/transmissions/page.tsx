import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTransmissionForm, updateTransmissionStatusForm } from "../actions";

export const dynamic = "force-dynamic";

const STATUSES = [
  "draft",
  "prepared",
  "sent",
  "delivered",
  "acknowledged",
  "failed",
  "follow_up_required",
];

export default async function TransmissionsPage() {
  const [session, supabase] = await Promise.all([
    getAdminSession(),
    createSupabaseServerClient(),
  ]);
  if (!session || !supabase) return null;

  const { data: transmissions } = await supabase
    .from("transmissions")
    .select("*, transmission_leads (lead_id, leads (human_id)), transmission_attachments (id)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Transmission log</h1>
      <p className="mt-1 text-sm text-charcoal-600">
        Documented handoffs to law enforcement. A transmission marked
        &ldquo;sent&rdquo; is never represented as received — only
        &ldquo;delivered&rdquo; or &ldquo;acknowledged&rdquo; update lead status.
      </p>

      <Card className="mt-5">
        <CardContent className="pt-5">
          <h2 className="font-semibold">New transmission packet</h2>
          <form action={createTransmissionForm} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input name="recipientName" required placeholder="Recipient (Det. John Cox) *" aria-label="Recipient" className="h-11 rounded-md border border-charcoal-300 px-3 text-sm" />
            <select name="method" aria-label="Method" className="h-11 rounded-md border border-charcoal-300 bg-white px-2 text-sm">
              {["email", "phone", "in_person", "portal", "mail", "other"].map((method) => (
                <option key={method} value={method}>
                  {method.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <input name="recipientEmail" placeholder="Recipient email" aria-label="Recipient email" className="h-11 rounded-md border border-charcoal-300 px-3 text-sm" />
            <input name="recipientPhone" placeholder="Recipient phone" aria-label="Recipient phone" className="h-11 rounded-md border border-charcoal-300 px-3 text-sm" />
            <input name="leadHumanIds" placeholder="Lead IDs (L-000001, L-000002)" aria-label="Lead IDs" className="h-11 rounded-md border border-charcoal-300 px-3 font-mono text-sm" />
            <input name="summary" placeholder="Summary" aria-label="Summary" className="h-11 rounded-md border border-charcoal-300 px-3 text-sm" />
            <button type="submit" className="h-11 rounded-md bg-steel-600 px-4 text-sm font-medium text-white hover:bg-steel-700">
              Create draft packet
            </button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-5 space-y-3">
        {(transmissions ?? []).map((transmission) => {
          const leadIds = (transmission.transmission_leads ?? [])
            .map((link: { leads: { human_id: string } | { human_id: string }[] | null }) => {
              const lead = Array.isArray(link.leads) ? link.leads[0] : link.leads;
              return lead?.human_id;
            })
            .filter(Boolean);
          return (
            <Card key={transmission.id}>
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{transmission.recipient_name}</h3>
                  <Badge variant="neutral">{transmission.method.replaceAll("_", " ")}</Badge>
                  <Badge variant={transmission.delivery_status === "failed" ? "warning" : "status"}>
                    {transmission.delivery_status.replaceAll("_", " ")}
                  </Badge>
                  {transmission.acknowledgment_received ? (
                    <Badge variant="law_enforcement">acknowledged</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-charcoal-500">
                  Leads: {leadIds.length ? leadIds.join(", ") : "none"} · Attachments:{" "}
                  {(transmission.transmission_attachments ?? []).length}
                  {transmission.transmitted_at
                    ? ` · sent ${new Date(transmission.transmitted_at).toLocaleString()}`
                    : ""}
                  {transmission.reference_number ? ` · ref ${transmission.reference_number}` : ""}
                </p>
                {transmission.summary ? <p className="mt-2 text-sm">{transmission.summary}</p> : null}
                <form action={updateTransmissionStatusForm} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="transmissionId" value={transmission.id} />
                  <select
                    name="status"
                    defaultValue={transmission.delivery_status}
                    aria-label={`Delivery status for ${transmission.recipient_name}`}
                    className="h-9 rounded-md border border-charcoal-300 bg-white px-2 text-sm"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <input
                    name="referenceNumber"
                    placeholder="APD reference #"
                    aria-label="Reference number"
                    defaultValue={transmission.reference_number ?? ""}
                    className="h-9 w-44 rounded-md border border-charcoal-300 px-2 text-sm"
                  />
                  <button type="submit" className="h-9 rounded-md bg-charcoal-900 px-3 text-sm font-medium text-white">
                    Update status
                  </button>
                </form>
              </CardContent>
            </Card>
          );
        })}
        {(transmissions ?? []).length === 0 ? (
          <p className="p-6 text-center text-charcoal-500">No transmissions recorded.</p>
        ) : null}
      </div>
    </div>
  );
}
