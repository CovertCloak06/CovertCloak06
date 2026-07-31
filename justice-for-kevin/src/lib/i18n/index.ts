import { en, type Dictionary } from "./en";
import { es } from "./es";

export type Locale = "en" | "es";
export const LOCALES: Locale[] = ["en", "es"];
export const LOCALE_COOKIE = "jfk_locale";

const dictionaries: Record<Locale, Dictionary> = { en, es };

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "es";
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Dictionary };
