/** Profile validation, shared by the profile screen and storage (no RN imports). */
import { normalizeCountryCode, servicesForCountry } from '@watch-party/shared/client';

export interface Profile {
  displayName: string;
  country: string;
  services: string[];
}

export interface ProfileErrors {
  displayName?: string;
  country?: string;
  services?: string;
}

export function validateProfile(p: Profile): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = p.displayName.trim();
  if (name.length === 0) errors.displayName = 'Pick a name your friends will recognise';
  else if (name.length > 40) errors.displayName = 'Keep it under 40 characters';
  const country = normalizeCountryCode(p.country);
  if (!country) errors.country = 'Choose the country your streaming accounts are registered in';
  if (p.services.length === 0) errors.services = 'Select at least one subscription';
  else if (country) {
    const sold = new Set(servicesForCountry(country).map((s) => s.id));
    if (p.services.some((s) => !sold.has(s))) errors.services = 'Some selected services are not sold in that country';
  }
  return errors;
}

/** Drops services that aren't sold in the (new) country, e.g. after switching US -> GB. */
export function reconcileServices(country: string, services: string[]): string[] {
  const sold = new Set(servicesForCountry(country).map((s) => s.id));
  return services.filter((s) => sold.has(s));
}

/** Parses stored JSON defensively; corrupted storage yields null, not a crash. */
export function parseStoredProfile(raw: string | null): Profile | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Profile>;
    if (typeof v.displayName !== 'string' || typeof v.country !== 'string' || !Array.isArray(v.services)) return null;
    const profile = { displayName: v.displayName, country: v.country, services: v.services.filter((s): s is string => typeof s === 'string') };
    return Object.keys(validateProfile(profile)).length === 0 ? profile : null;
  } catch {
    return null;
  }
}
