import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { LanguageToggle } from "./language-toggle";
import { MobileNav } from "./mobile-nav";

export function SiteHeader({ t, locale }: { t: Dictionary; locale: Locale }) {
  const links = [
    { href: "/case", label: t.nav.case },
    { href: "/witness", label: t.nav.witness },
    { href: "/timeline", label: t.nav.timeline },
    { href: "/updates", label: t.nav.updates },
    { href: "/share", label: t.nav.share },
    { href: "/flyers", label: t.nav.flyers },
    { href: "/sources", label: t.nav.sources },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-charcoal-800 bg-charcoal-900 text-paper">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex flex-col leading-tight">
          <span className="text-base font-semibold tracking-tight">{t.siteTitle}</span>
          <span className="hidden text-[11px] text-charcoal-300 sm:block">
            {t.siteSubtitle}
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-charcoal-200 hover:bg-charcoal-800 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/submit-information"
            className="ml-2 rounded-md bg-steel-600 px-4 py-2 text-sm font-semibold text-white hover:bg-steel-700"
          >
            {t.nav.submit}
          </Link>
        </nav>

        <div className="flex items-center gap-1">
          <LanguageToggle locale={locale} label={t.common.languageToggle} />
          <MobileNav
            links={[...links, { href: "/submit-information", label: t.nav.submit }]}
          />
        </div>
      </div>
    </header>
  );
}
