import "server-only";
import { caseSeed, type CaseInfo } from "@/lib/case";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Public read layer. Every function degrades gracefully to seed data (or an
 * empty list) when Supabase is not configured or unreachable so the public
 * site keeps serving verified core facts. Only rows with approved=true are
 * visible to anonymous readers (also enforced by RLS).
 */

export type VerificationType = "law_enforcement" | "official_record" | "media" | "campaign";

export type PublicFact = {
  id: string;
  text: string;
  verificationType: VerificationType;
};

export type PublicUpdate = {
  id: string;
  title: string;
  body: string;
  verificationType: VerificationType;
  sourceDate: string;
  publishedAt: string;
  needsVerification: boolean;
};

export type PublicTimelineEntry = {
  id: string;
  eventDate: string;
  publicationDate: string | null;
  title: string;
  summary: string;
  verificationType: VerificationType;
  correctedAt: string | null;
  correctionNote: string | null;
  needsVerification: boolean;
};

export type PublicSource = {
  id: string;
  title: string;
  publisher: string;
  sourceType: string;
  originalUrl: string | null;
  publicationDate: string | null;
  accessedDate: string | null;
  summary: string;
  verificationStatus: string;
  lastReviewedAt: string | null;
  needsVerification: boolean;
};

export type WitnessAsset = {
  publicUrl: string;
  description: string;
  releasedOn: string | null;
  agencySource: string;
};

export async function getCaseInfo(): Promise<CaseInfo> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ...caseSeed };
  const { data } = await supabase
    .from("cases")
    .select(
      "victim_name, victim_age, incident_date, incident_location, investigating_agency, investigator_name, investigator_badge, investigator_phone, investigator_email, case_number, case_status, public_objective",
    )
    .eq("is_primary", true)
    .maybeSingle();
  if (!data) return { ...caseSeed };
  return {
    victimName: data.victim_name,
    victimAge: data.victim_age,
    incidentDate: data.incident_date,
    incidentLocation: data.incident_location,
    investigatingAgency: data.investigating_agency,
    investigatorName: data.investigator_name,
    investigatorBadge: data.investigator_badge,
    investigatorPhone: data.investigator_phone,
    investigatorEmail: data.investigator_email,
    caseNumber: data.case_number,
    caseStatus: data.case_status,
    publicObjective: data.public_objective,
  };
}

export async function getApprovedFacts(): Promise<PublicFact[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("official_updates")
    .select("id, body, verification_type")
    .eq("approved", true)
    .eq("kind", "fact")
    .order("sort_order", { ascending: true });
  return (data ?? []).map((row) => ({
    id: row.id,
    text: row.body,
    verificationType: row.verification_type as VerificationType,
  }));
}

export async function getPublicUpdates(limit = 20): Promise<PublicUpdate[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("official_updates")
    .select("id, title, body, verification_type, source_date, published_at, needs_verification")
    .eq("approved", true)
    .eq("kind", "update")
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? "",
    body: row.body,
    verificationType: row.verification_type as VerificationType,
    sourceDate: row.source_date,
    publishedAt: row.published_at,
    needsVerification: row.needs_verification,
  }));
}

export async function getTimelineEntries(): Promise<PublicTimelineEntry[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("timeline_entries")
    .select(
      "id, event_date, publication_date, title, summary, verification_type, corrected_at, correction_note, needs_verification",
    )
    .eq("approved", true)
    .order("event_date", { ascending: true });
  return (data ?? []).map((row) => ({
    id: row.id,
    eventDate: row.event_date,
    publicationDate: row.publication_date,
    title: row.title,
    summary: row.summary,
    verificationType: row.verification_type as VerificationType,
    correctedAt: row.corrected_at,
    correctionNote: row.correction_note,
    needsVerification: row.needs_verification,
  }));
}

export async function getPublicSources(): Promise<PublicSource[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("sources")
    .select(
      "id, title, publisher, source_type, original_url, publication_date, accessed_date, summary, verification_status, last_reviewed_at, needs_verification",
    )
    .eq("approved", true)
    .order("publication_date", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    publisher: row.publisher,
    sourceType: row.source_type,
    originalUrl: row.original_url,
    publicationDate: row.publication_date,
    accessedDate: row.accessed_date,
    summary: row.summary ?? "",
    verificationStatus: row.verification_status,
    lastReviewedAt: row.last_reviewed_at,
    needsVerification: row.needs_verification,
  }));
}

export async function getWitnessAsset(): Promise<WitnessAsset | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("public_assets")
    .select("public_url, description, released_on, agency_source")
    .eq("approved", true)
    .eq("kind", "witness_image")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    publicUrl: data.public_url,
    description: data.description ?? "",
    releasedOn: data.released_on,
    agencySource: data.agency_source ?? "",
  };
}

export type SiteSettings = {
  secureIntakeEnabled: boolean;
  emergencyNotice: string | null;
  maintenanceMode: boolean;
};

export async function getSiteSettings(): Promise<SiteSettings> {
  const fallback: SiteSettings = {
    secureIntakeEnabled: false,
    emergencyNotice: null,
    maintenanceMode: false,
  };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fallback;
  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .eq("public", true);
  if (!data) return fallback;
  const map = new Map(data.map((row) => [row.key, row.value]));
  return {
    secureIntakeEnabled: map.get("secure_intake_enabled") === "true",
    emergencyNotice: (map.get("emergency_notice") as string | undefined) || null,
    maintenanceMode: map.get("maintenance_mode") === "true",
  };
}
