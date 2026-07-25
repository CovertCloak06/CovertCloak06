import { AlertTriangle } from "lucide-react";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { getCaseInfo, getSiteSettings } from "@/lib/data/public";
import { getT } from "@/lib/i18n/server";

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [{ t, locale }, settings] = await Promise.all([getT(), getSiteSettings()]);

  if (settings.maintenanceMode) {
    const caseInfo = await getCaseInfo();
    return (
      <main id="main-content" className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-lg py-24 text-center">
          <h1 className="text-2xl font-semibold">{t.siteTitle}</h1>
          <p className="prose-serif mt-3 text-charcoal-700">
            {locale === "es"
              ? "El sitio está temporalmente en mantenimiento. La investigación sigue activa."
              : "The site is temporarily down for maintenance. The investigation remains active."}
          </p>
          <p className="mt-6 rounded-lg border border-steel-600 bg-steel-100/40 p-4 text-sm">
            {caseInfo.investigatorName} · {caseInfo.investigatingAgency}
            <br />
            <a className="underline underline-offset-2" href={`tel:+1${caseInfo.investigatorPhone.replace(/\D/g, "")}`}>
              {caseInfo.investigatorPhone}
            </a>{" "}
            ·{" "}
            <a className="underline underline-offset-2" href={`mailto:${caseInfo.investigatorEmail}`}>
              {caseInfo.investigatorEmail}
            </a>
            <br />
            {t.hero.caseNumber}: {caseInfo.caseNumber}
          </p>
          <p className="mt-4 text-sm text-charcoal-500">{t.submit.emergency}</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        {t.common.skipToContent}
      </a>
      <SiteHeader t={t} locale={locale} />
      {settings.emergencyNotice ? (
        <div
          role="alert"
          className="border-b border-urgent-700 bg-urgent-100 px-4 py-3"
        >
          <p className="mx-auto flex max-w-6xl items-start gap-2.5 font-medium text-charcoal-900">
            <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-urgent-700" />
            {settings.emergencyNotice}
          </p>
        </div>
      ) : null}
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter t={t} />
    </>
  );
}
