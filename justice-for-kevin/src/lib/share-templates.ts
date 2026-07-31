import type { CaseInfo } from "@/lib/case";

/**
 * Approved, non-sensational share language. Every template automatically
 * includes the verified case facts and detective contact. No "wanted"
 * framing, no accusatory language — the person shown is a potential witness.
 */

export type ShareFormat =
  | "facebook"
  | "instagram_square"
  | "instagram_story"
  | "x"
  | "nextdoor"
  | "reddit"
  | "sms"
  | "email";

export const DEFAULT_HEADLINE: Record<"en" | "es", string> = {
  en: "Police Need Help Identifying a Potential Witness",
  es: "La policía necesita ayuda para identificar a un posible testigo",
};

export const DEFAULT_BODY: Record<"en" | "es", string> = {
  en: "Antioch Police are seeking help identifying a person who may have information relevant to the July 11, 2024 homicide of Kevin Vandenbos. If you recognize this person or have specific information related to the incident, contact Detective John Cox and reference case 24-6070.",
  es: "La policía de Antioch busca ayuda para identificar a una persona que podría tener información relevante sobre el homicidio de Kevin Vandenbos ocurrido el 11 de julio de 2024. Si reconoce a esta persona o tiene información específica sobre el incidente, comuníquese con el detective John Cox y mencione el caso 24-6070.",
};

export function caseFactsBlock(caseInfo: CaseInfo, language: "en" | "es"): string {
  const date = language === "es" ? "11 de julio de 2024" : "July 11, 2024";
  return [
    `${caseInfo.victimName} — ${language === "es" ? "Edad" : "Age"} ${caseInfo.victimAge}`,
    date,
    caseInfo.incidentLocation,
    `${language === "es" ? "Caso" : "Case"} ${caseInfo.caseNumber}`,
    caseInfo.investigatorName,
    caseInfo.investigatorPhone,
    caseInfo.investigatorEmail,
  ].join("\n");
}

export function buildShareText(options: {
  format: ShareFormat;
  caseInfo: CaseInfo;
  headline: string;
  body: string;
  language: "en" | "es";
  siteUrl: string;
  includeDetectiveContact: boolean;
  detailed: boolean;
}): string {
  const { format, caseInfo, headline, body, language, siteUrl, includeDetectiveContact, detailed } = options;
  const url = `${siteUrl.replace(/\/+$/, "")}/witness`;
  const contact = includeDetectiveContact
    ? `\n${caseInfo.investigatorName} · ${caseInfo.investigatorPhone} · ${caseInfo.investigatorEmail}`
    : "";
  const caseTag = `${language === "es" ? "Caso" : "Case"} ${caseInfo.caseNumber}`;

  switch (format) {
    case "x": {
      const short =
        language === "es"
          ? `La policía de Antioch busca identificar a un posible testigo del homicidio de Kevin Vandenbos (11 jul 2024). ${caseTag}. ${url}`
          : `Antioch Police are seeking to identify a potential witness in the July 11, 2024 homicide of Kevin Vandenbos. ${caseTag}. ${url}`;
      return short;
    }
    case "sms":
      return language === "es"
        ? `${headline}. ${caseTag} — Kevin Vandenbos. Información: ${url}${includeDetectiveContact ? ` o ${caseInfo.investigatorPhone}` : ""}`
        : `${headline}. ${caseTag} — Kevin Vandenbos. Info: ${url}${includeDetectiveContact ? ` or ${caseInfo.investigatorPhone}` : ""}`;
    case "email":
      return `${headline}\n\n${body}\n\n${caseFactsBlock(caseInfo, language)}\n\n${url}`;
    case "reddit":
    case "nextdoor":
    case "facebook":
      return detailed
        ? `${headline}\n\n${body}\n\n${caseFactsBlock(caseInfo, language)}\n\n${url}`
        : `${headline}\n\n${body}${contact}\n\n${url}`;
    case "instagram_square":
    case "instagram_story":
      return `${headline}\n\n${body}${contact}\n\n${url}`;
    default:
      return `${headline}\n\n${body}\n\n${url}`;
  }
}
