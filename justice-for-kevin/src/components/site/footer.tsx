import Link from "next/link";
import type { Dictionary } from "@/lib/i18n";

export function SiteFooter({ t }: { t: Dictionary }) {
  return (
    <footer className="mt-16 border-t border-charcoal-200 bg-charcoal-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="max-w-3xl text-sm leading-relaxed text-charcoal-600">
          {t.footer.disclaimer}
        </p>
        <nav
          aria-label="Footer"
          className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm"
        >
          <Link className="text-charcoal-700 underline-offset-2 hover:underline" href="/privacy">
            {t.nav.privacy}
          </Link>
          <Link className="text-charcoal-700 underline-offset-2 hover:underline" href="/terms">
            {t.nav.terms}
          </Link>
          <Link className="text-charcoal-700 underline-offset-2 hover:underline" href="/accessibility">
            {t.nav.accessibility}
          </Link>
          <Link className="text-charcoal-700 underline-offset-2 hover:underline" href="/sources">
            {t.nav.sources}
          </Link>
        </nav>
        <p className="mt-6 text-xs text-charcoal-500">
          © {new Date().getFullYear()} {t.siteTitle}
        </p>
      </div>
    </footer>
  );
}
