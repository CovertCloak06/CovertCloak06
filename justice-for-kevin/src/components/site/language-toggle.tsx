"use client";

import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";

export function LanguageToggle({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
}) {
  const router = useRouter();
  const next: Locale = locale === "en" ? "es" : "en";

  return (
    <button
      type="button"
      lang={next}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
      className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-charcoal-200 hover:bg-charcoal-800 hover:text-white"
      aria-label={`Switch language to ${next === "es" ? "Español" : "English"}`}
    >
      <Languages aria-hidden className="size-4" />
      {label}
    </button>
  );
}
