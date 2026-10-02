import { cookies } from "next/headers";
import { getDictionary, isLocale, LOCALE_COOKIE, type Dictionary, type Locale } from "./index";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
}

export async function getT(): Promise<{ t: Dictionary; locale: Locale }> {
  const locale = await getLocale();
  return { t: getDictionary(locale), locale };
}
