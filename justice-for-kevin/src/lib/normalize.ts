/**
 * Normalization helpers used for duplicate detection and search indexing.
 * All functions are pure and unit-tested (see src/lib/__tests__).
 */

/** Normalize a US-centric phone number to E.164 where possible, otherwise
 * digits-only. Returns "" for inputs with no digits. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** Normalize a social-media username: strip leading @, URL cruft, lowercase. */
export function normalizeUsername(input: string): string {
  let value = input.trim().toLowerCase();
  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const url = new URL(value);
      value = url.pathname;
    }
  } catch {
    // not a URL — keep as-is
  }
  return value.replace(/^[/@]+/, "").replace(/\/+$/, "");
}

/** Normalize a person/display name for comparison: collapse whitespace,
 * lowercase, strip punctuation and diacritics. */
export function normalizeName(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize manually-entered license plate text: uppercase alphanumerics only. */
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Normalize a URL for comparison: lowercase host, drop tracking params,
 * trailing slash, and fragments. Returns trimmed input when unparseable. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const TRACKING = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "igsh",
    ];
    for (const key of TRACKING) url.searchParams.delete(key);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    let out = url.toString();
    if (out.endsWith("/") && url.pathname === "/" && !url.search) {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return trimmed;
  }
}
