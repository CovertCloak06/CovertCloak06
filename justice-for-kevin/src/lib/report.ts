import type { CaseInfo } from "@/lib/case";
import type { TipSubmission } from "@/lib/tip-schema";

const CATEGORY_LABELS: Record<TipSubmission["category"], string> = {
  recognize_person: "I recognize the person",
  know_name: "I may know the person's name or nickname",
  saw_something: "I saw something near the incident location",
  vehicle_info: "I have vehicle information",
  media_evidence: "I have video, photos, or screenshots",
  social_media_info: "I have social-media information",
  heard_from_other: "I heard information from another person",
  other: "Other",
};

const SOURCE_LABELS: Record<TipSubmission["sourceClassification"], string> = {
  firsthand: "Firsthand observation",
  recognition: "Direct recognition",
  secondhand: "Information told to me by another person",
  online: "Public online information",
  speculation: "Personal inference or speculation",
};

export function categoryLabel(category: TipSubmission["category"]): string {
  return CATEGORY_LABELS[category];
}

export function sourceLabel(
  classification: TipSubmission["sourceClassification"],
): string {
  return SOURCE_LABELS[classification];
}

function line(label: string, value?: string): string {
  return `${label}: ${value?.trim() ? value.trim() : "—"}`;
}

/**
 * Format a structured plain-text report suitable for email, clipboard, or
 * local download. This exact text also feeds the PDF generator.
 */
export function formatTipReport(
  tip: TipSubmission,
  caseInfo: CaseInfo,
  generatedAtIso: string,
): string {
  const { details, contact } = tip;

  const submitter = contact.anonymous
    ? "Anonymous submission"
    : [contact.fullName, contact.phone, contact.email]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" | ") || "—";

  const contactPermission = contact.anonymous
    ? "Anonymous — no contact requested"
    : [
        contact.detectiveMayContact
          ? "Detective may contact"
          : "Detective may NOT contact",
        contact.campaignMayContact
          ? "Campaign administrators may contact"
          : "Campaign administrators may NOT contact",
        `Preferred method: ${contact.preferredContactMethod}`,
      ].join("; ");

  const isFirsthand =
    tip.sourceClassification === "firsthand" ||
    tip.sourceClassification === "recognition";
  const isSecondhand = tip.sourceClassification === "secondhand";
  const isSpeculation = tip.sourceClassification === "speculation";

  const sections: string[] = [
    `CASE: ${caseInfo.victimName} Homicide`,
    `CASE NUMBER: ${caseInfo.caseNumber}`,
    `DATE GENERATED: ${generatedAtIso}`,
    `INFORMATION CATEGORY: ${CATEGORY_LABELS[tip.category]}`,
    `SOURCE CLASSIFICATION: ${SOURCE_LABELS[tip.sourceClassification]}`,
    "",
    `SUBMITTER: ${submitter}`,
    `CONTACT PERMISSION: ${contactPermission}`,
    "",
    "SUMMARY:",
    details.narrative.trim().split("\n")[0] ?? "—",
    "",
    line(
      "POSSIBLE NAME OR NICKNAME",
      [details.possibleName, details.possibleNickname]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" / "),
    ),
    "",
    line(
      "ASSOCIATED LOCATIONS",
      [
        details.cityOrNeighborhood,
        details.workplaceOrBusiness,
        details.schoolOrOrganization,
        details.locationLastSeen,
      ]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join("; "),
    ),
    "",
    line("ASSOCIATED VEHICLE", details.knownVehicle),
    "",
    line("ASSOCIATED ONLINE ACCOUNTS", details.knownSocialMedia),
    "",
    "FIRSTHAND OBSERVATIONS:",
    isFirsthand ? details.narrative.trim() : "—",
    "",
    "INFORMATION HEARD FROM OTHERS:",
    isSecondhand ? details.narrative.trim() : "—",
    "",
    "INFERENCES OR SPECULATION:",
    isSpeculation ? details.narrative.trim() : "—",
    "",
    "ATTACHMENTS:",
    ...(tip.attachments.length === 0
      ? ["- none"]
      : tip.attachments.map(
          (att) =>
            `- ${att.filename}\n  SHA-256: ${att.sha256}\n  size: ${att.sizeBytes} bytes\n  timestamp: ${att.uploadedAt}`,
        )),
    "",
    "ADDITIONAL NOTES:",
    [
      details.howKnown?.trim() ? `How the person is known: ${details.howKnown.trim()}` : "",
      details.approximateAge?.trim() ? `Approximate age: ${details.approximateAge.trim()}` : "",
      details.dateLastSeen?.trim() ? `Date last seen: ${details.dateLastSeen.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n") || "—",
    "",
    "---",
    `Prepared via the ${caseInfo.victimName} community information site for delivery to ` +
      `${caseInfo.investigatorName} (Badge #${caseInfo.investigatorBadge}), ` +
      `${caseInfo.investigatingAgency}, ${caseInfo.investigatorPhone}, ${caseInfo.investigatorEmail}.`,
    "This report separates firsthand knowledge from secondhand information and speculation as classified by the submitter.",
    "Not an emergency reporting system. For emergencies call 911.",
  ];

  return sections.join("\n");
}
