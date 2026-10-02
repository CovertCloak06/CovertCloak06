import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateSiteSettingForm } from "../actions";

export const dynamic = "force-dynamic";

const SETTING_DESCRIPTIONS: Record<string, string> = {
  site_title: "Site title shown across the public site",
  site_domain: "Canonical public domain",
  secure_intake_enabled: "true/false — enables stored web submissions with lead references",
  attachment_limit_bytes: "Server-side attachment ceiling in bytes (default 104857600 = 100 MB)",
  public_timeline_visible: "true/false — show the public timeline page",
  spanish_enabled: "true/false — Spanish translation status",
  analytics_enabled: "true/false — privacy-conscious analytics",
  emergency_notice: "Optional urgent banner text for the public site",
  maintenance_mode: "true/false — public site maintenance page",
  witness_wording:
    "Approved public wording for the person in released material. Update only from an official law-enforcement statement.",
  share_headline_en: "Default share headline (English)",
  share_body_en: "Default share body (English)",
  share_headline_es: "Default share headline (Spanish)",
  share_body_es: "Default share body (Spanish)",
};

export default async function SettingsPage() {
  const [session, supabase] = await Promise.all([
    getAdminSession(),
    createSupabaseServerClient(),
  ]);
  if (!session || !supabase) return null;

  if (!hasPermission(session.role, "manage_settings")) {
    return (
      <p role="alert" className="rounded border border-urgent-700 bg-urgent-100 p-4">
        Your role cannot manage settings.
      </p>
    );
  }

  const { data: settings } = await supabase
    .from("site_settings")
    .select("key, value, public, updated_at")
    .order("key");

  return (
    <div>
      <h1 className="text-2xl font-semibold">Site settings</h1>
      <p className="mt-1 text-sm text-charcoal-600">
        Every change creates an audit event. Wording changes for the witness
        description must be based on an official law-enforcement statement.
      </p>

      <div className="mt-5 space-y-3">
        {(settings ?? []).map((setting) => (
          <Card key={setting.key}>
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-sm font-semibold">{setting.key}</code>
                {setting.public ? <Badge variant="neutral">public</Badge> : <Badge variant="status">private</Badge>}
                <span className="text-xs text-charcoal-500">
                  updated {new Date(setting.updated_at).toLocaleString()}
                </span>
              </div>
              {SETTING_DESCRIPTIONS[setting.key] ? (
                <p className="mt-1 text-xs text-charcoal-500">{SETTING_DESCRIPTIONS[setting.key]}</p>
              ) : null}
              <form action={updateSiteSettingForm} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="key" value={setting.key} />
                <input
                  name="value"
                  defaultValue={setting.value ?? ""}
                  aria-label={`Value for ${setting.key}`}
                  className="h-10 min-w-64 flex-1 rounded-md border border-charcoal-300 px-3 text-sm"
                />
                <button
                  type="submit"
                  className="h-10 rounded-md bg-charcoal-900 px-4 text-sm font-medium text-white"
                >
                  Save
                </button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
