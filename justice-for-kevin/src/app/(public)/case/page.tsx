import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CaseReferenceBox } from "@/components/site/case-reference";
import { DetectiveActions } from "@/components/site/detective-actions";
import { getApprovedFacts, getCaseInfo } from "@/lib/data/public";
import { getT } from "@/lib/i18n/server";
import { formatDateISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The Case" };

export default async function CasePage() {
  const [{ t, locale }, caseInfo, facts] = await Promise.all([
    getT(),
    getCaseInfo(),
    getApprovedFacts(),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
        {t.nav.case}: {caseInfo.victimName}
      </h1>

      <dl className="mt-6 grid gap-3 rounded-lg border border-charcoal-200 bg-white p-5 sm:grid-cols-2">
        {[
          [t.hero.age, String(caseInfo.victimAge)],
          [t.hero.incidentDate, formatDateISO(caseInfo.incidentDate, locale)],
          [t.hero.incidentLocation, caseInfo.incidentLocation],
          [t.hero.caseStatus, caseInfo.caseStatus],
          [t.hero.caseNumber, caseInfo.caseNumber],
          [t.witness.agencySource, caseInfo.investigatingAgency],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm font-semibold text-charcoal-600">{label}</dt>
            <dd className="text-charcoal-900">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="prose-serif mt-8 max-w-prose text-lg text-charcoal-800">
        {caseInfo.publicObjective}
      </p>

      <section aria-labelledby="case-facts" className="mt-10">
        <h2 id="case-facts" className="text-2xl font-semibold">
          {t.home.verifiedSummary}
        </h2>
        {facts.length === 0 ? (
          <p className="prose-serif mt-3 text-charcoal-600">{t.home.noUpdates}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {facts.map((fact) => (
              <li key={fact.id}>
                <Card>
                  <CardContent className="pt-5">
                    <Badge variant={fact.verificationType}>
                      {t.home.sourceBadges[fact.verificationType]}
                    </Badge>
                    <p className="prose-serif mt-2 text-charcoal-800">{fact.text}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-charcoal-600">
          <Link href="/sources" className="underline underline-offset-2">
            {t.nav.sources}
          </Link>{" "}
          ·{" "}
          <Link href="/timeline" className="underline underline-offset-2">
            {t.nav.timeline}
          </Link>
        </p>
      </section>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <CaseReferenceBox caseInfo={caseInfo} t={t} />
        <div className="flex items-center">
          <DetectiveActions
            caseInfo={caseInfo}
            callLabel={t.hero.callDetective}
            emailLabel={t.hero.emailDetective}
          />
        </div>
      </div>
    </div>
  );
}
