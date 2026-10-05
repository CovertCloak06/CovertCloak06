/**
 * Countries the app offers in its profile picker. Codes are ISO 3166-1 alpha-2.
 *
 * Streaming catalogs are regional, so the country a user picks must be the one
 * their streaming account is registered in, not where they happen to be.
 */
export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: readonly Country[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IE', name: 'Ireland' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'DE', name: 'Germany' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'FR', name: 'France' },
  { code: 'BE', name: 'Belgium' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'ES', name: 'Spain' },
  { code: 'PT', name: 'Portugal' },
  { code: 'IT', name: 'Italy' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SG', name: 'Singapore' },
  { code: 'ZA', name: 'South Africa' },
];

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

/**
 * Common non-ISO spellings mapped to their ISO code. "UK" is the important
 * one: people (and the original protocol examples) say UK, ISO says GB.
 */
const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  UK: 'GB',
  EN: 'GB',
  USA: 'US',
};

/**
 * Normalises user or client supplied country input to a supported ISO code.
 * Returns `null` when the country is unknown or unsupported.
 */
export function normalizeCountryCode(input: string): string | null {
  const upper = input.trim().toUpperCase();
  const code = COUNTRY_ALIASES[upper] ?? upper;
  return COUNTRY_CODES.has(code) ? code : null;
}

/** Regional-indicator flag emoji for an ISO alpha-2 code. */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
