import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { getT } from "@/lib/i18n/server";

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { t, locale } = await getT();

  return (
    <>
      <a href="#main-content" className="skip-link">
        {t.common.skipToContent}
      </a>
      <SiteHeader t={t} locale={locale} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter t={t} />
    </>
  );
}
