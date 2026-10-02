/**
 * Configurable case seed data. This is the fallback used when the Supabase
 * database is not configured/reachable; the canonical copy lives in the
 * `cases` table (see supabase/migrations + supabase/seed.sql) and admin
 * settings override these values at runtime.
 */
export const caseSeed = {
  victimName: "Kevin Vandenbos",
  victimAge: 36,
  incidentDate: "2024-07-11",
  incidentLocation: "600 block of Wilbur Avenue, Antioch, California",
  investigatingAgency: "Antioch Police Department",
  investigatorName: "Detective John Cox",
  investigatorBadge: "5705",
  investigatorPhone: "(925) 481-8147",
  investigatorEmail: "jcox@antiochca.gov",
  caseNumber: "24-6070",
  caseStatus: "Open / Active",
  publicObjective:
    "Identify a person shown in law-enforcement-released surveillance material who may have information relevant to the investigation.",
} as const;

export type CaseInfo = {
  victimName: string;
  victimAge: number;
  incidentDate: string;
  incidentLocation: string;
  investigatingAgency: string;
  investigatorName: string;
  investigatorBadge: string;
  investigatorPhone: string;
  investigatorEmail: string;
  caseNumber: string;
  caseStatus: string;
  publicObjective: string;
};

/** Approved wording for the person in released material. Only an
 * authenticated administrator may change this via site settings. */
export const WITNESS_LANGUAGE =
  "A potential witness or person police are seeking to identify.";

export function detectiveTelHref(info: CaseInfo): string {
  return `tel:+1${info.investigatorPhone.replace(/\D/g, "")}`;
}

export function detectiveMailtoHref(info: CaseInfo): string {
  const subject = encodeURIComponent(
    `Case ${info.caseNumber} — Information Regarding ${info.victimName} Investigation`,
  );
  return `mailto:${info.investigatorEmail}?subject=${subject}`;
}
