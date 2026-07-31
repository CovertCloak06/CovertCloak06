import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { TipForm } from "@/components/site/tip-form";
import { getCaseInfo, getSiteSettings } from "@/lib/data/public";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Submit Information" };

export default async function SubmitInformationPage() {
  const [{ t }, caseInfo, settings] = await Promise.all([
    getT(),
    getCaseInfo(),
    getSiteSettings(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t.submit.title}</h1>
      <p className="prose-serif mt-3 max-w-prose text-charcoal-700">{t.submit.intro}</p>

      <p
        role="note"
        className="mt-5 flex items-start gap-2.5 rounded-lg border border-urgent-700 bg-urgent-100 p-4 font-medium"
      >
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-urgent-700" />
        {t.submit.emergency}
      </p>

      <div className="mt-8">
        <TipForm
          caseInfo={caseInfo}
          secureIntakeEnabled={settings.secureIntakeEnabled}
          stepLabels={t.submit.steps}
          labels={{
            next: t.submit.next,
            back: t.submit.back,
            speculationWarning: t.submit.speculationWarning,
            anonymousNote: t.submit.anonymousNote,
            emergency: t.submit.emergency,
          }}
        />
      </div>
    </div>
  );
}
