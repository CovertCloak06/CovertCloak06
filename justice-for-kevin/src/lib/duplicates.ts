import {
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeUrl,
  normalizeUsername,
} from "@/lib/normalize";

/**
 * Conservative duplicate *suggestion* scoring. This produces suggestions
 * only — a human reviewer must confirm duplicate status, and the system
 * never merges or deletes leads automatically.
 */

export type DuplicateSignals = {
  phones?: string[];
  emails?: string[];
  usernames?: string[];
  names?: string[];
  fileHashes?: string[];
  vehicleDescriptions?: string[];
  urls?: string[];
  narrative?: string;
};

export type DuplicateReason =
  | "phone_match"
  | "email_match"
  | "username_match"
  | "name_match"
  | "file_hash_match"
  | "vehicle_similarity"
  | "url_match"
  | "narrative_similarity";

export type DuplicateScore = {
  score: number;
  reasons: DuplicateReason[];
};

const WEIGHTS: Record<DuplicateReason, number> = {
  phone_match: 0.9,
  email_match: 0.9,
  username_match: 0.8,
  file_hash_match: 0.95,
  name_match: 0.5,
  url_match: 0.6,
  vehicle_similarity: 0.4,
  narrative_similarity: 0.45,
};

/** Threshold above which a pair is surfaced as a duplicate *suggestion*. */
export const SUGGESTION_THRESHOLD = 0.4;

function overlap(a: string[] | undefined, b: string[] | undefined, normalize: (s: string) => string): boolean {
  if (!a?.length || !b?.length) return false;
  const setA = new Set(a.map(normalize).filter(Boolean));
  return b.some((item) => {
    const normalized = normalize(item);
    return normalized !== "" && setA.has(normalized);
  });
}

/** Jaccard similarity over word trigrams — a cheap in-app analogue of the
 * pg_trgm similarity used server-side for candidate generation. */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (text: string): Set<string> => {
    const clean = ` ${normalizeName(text)} `;
    const set = new Set<string>();
    for (let index = 0; index <= clean.length - 3; index += 1) {
      set.add(clean.slice(index, index + 3));
    }
    return set;
  };
  const gramsA = grams(a);
  const gramsB = grams(b);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  let shared = 0;
  for (const gram of gramsA) if (gramsB.has(gram)) shared += 1;
  return shared / (gramsA.size + gramsB.size - shared);
}

export function scoreDuplicate(a: DuplicateSignals, b: DuplicateSignals): DuplicateScore {
  const reasons: DuplicateReason[] = [];

  if (overlap(a.phones, b.phones, normalizePhone)) reasons.push("phone_match");
  if (overlap(a.emails, b.emails, normalizeEmail)) reasons.push("email_match");
  if (overlap(a.usernames, b.usernames, normalizeUsername)) reasons.push("username_match");
  if (overlap(a.names, b.names, normalizeName)) reasons.push("name_match");
  if (overlap(a.fileHashes, b.fileHashes, (hash) => hash.toLowerCase())) {
    reasons.push("file_hash_match");
  }
  if (overlap(a.urls, b.urls, normalizeUrl)) reasons.push("url_match");

  if (
    a.vehicleDescriptions?.length &&
    b.vehicleDescriptions?.length &&
    a.vehicleDescriptions.some((vehicleA) =>
      b.vehicleDescriptions!.some((vehicleB) => trigramSimilarity(vehicleA, vehicleB) > 0.5),
    )
  ) {
    reasons.push("vehicle_similarity");
  }

  if (a.narrative && b.narrative && trigramSimilarity(a.narrative, b.narrative) > 0.6) {
    reasons.push("narrative_similarity");
  }

  // Combine as noisy-or so several weak signals never outrank one strong one.
  const score = 1 - reasons.reduce((acc, reason) => acc * (1 - WEIGHTS[reason]), 1);
  return { score: Math.round(score * 1000) / 1000, reasons };
}

export function isDuplicateSuggestion(score: DuplicateScore): boolean {
  return score.score >= SUGGESTION_THRESHOLD;
}
