import Link from "next/link";
import { FileText, ImageIcon, Megaphone, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CaseReferenceBox } from "@/components/site/case-reference";
import { DetectiveActions } from "@/components/site/detective-actions";
import {
  getApprovedFacts,
  getCaseInfo,
  getPublicUpdates,
  getWitnessAsset,
} from "@/lib/data/public";
import { getT } from "@/lib/i18n/server";
import { formatDateISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ t, locale }, caseInfo, facts, updates, witnessAsset] = await Promise.all([
    getT(),
    getCaseInfo(),
    getApprovedFacts(),
    getPublicUpdates(1),
    getWitnessAsset(),
  ]);
  const latestUpdate = updates[0];

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="grid gap-8 py-12 md:grid-cols-[3fr_2fr] md:py-16">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-steel-700">
            {caseInfo.caseStatus} · {t.hero.caseNumber} {caseInfo.caseNumber}
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-charcoal-950 md:text-5xl">
            {caseInfo.victimName}
          </h1>
          <p className="prose-serif mt-4 max-w-prose text-lg text-charcoal-700">
            {t.hero.age} {caseInfo.victimAge} · {formatDateISO(caseInfo.incidentDate, locale)}
            <br />
            {caseInfo.incidentLocation}
          </p>
          <p className="prose-serif mt-4 max-w-prose text-charcoal-700">
            {caseInfo.publicObjective}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/witness" variant="primary" size="lg">
              <Search aria-hidden />
              {t.hero.helpIdentify}
            </ButtonLink>
            <ButtonLink href="/share" variant="outline" size="lg" className="bg-white">
              <Megaphone aria-hidden />
              {t.hero.shareCase}
            </ButtonLink>
          </div>

          <div className="mt-4">
            <DetectiveActions
              caseInfo={caseInfo}
              callLabel={t.hero.callDetective}
              emailLabel={t.hero.emailDetective}
              size="default"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/witness" className="inline-flex items-center gap-1.5 font-medium text-steel-700 underline-offset-2 hover:underline">
              <ImageIcon aria-hidden className="size-4" />
              {t.hero.viewWitness}
            </Link>
            <Link href="/flyers" className="inline-flex items-center gap-1.5 font-medium text-steel-700 underline-offset-2 hover:underline">
              <FileText aria-hidden className="size-4" />
              {t.hero.generateFlyer}
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <CaseReferenceBox caseInfo={caseInfo} t={t} />
          {witnessAsset ? (
            <Link href="/witness" className="block overflow-hidden rounded-lg border border-charcoal-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={witnessAsset.publicUrl}
                alt={witnessAsset.description || t.witness.imageAlt}
                className="w-full object-cover"
              />
            </Link>
          ) : null}
        </div>
      </section>

      {/* Verified case summary */}
      <section aria-labelledby="verified-summary" className="border-t border-charcoal-200 py-12">
        <h2 id="verified-summary" className="text-2xl font-semibold">
          {t.home.verifiedSummary}
        </h2>
        {facts.length === 0 ? (
          <p className="prose-serif mt-4 max-w-prose text-charcoal-600">
            {t.home.noUpdates}
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {facts.map((fact) => (
              <li key={fact.id}>
                <Card className="h-full">
                  <CardContent className="pt-5">
                    <Badge variant={fact.verificationType}>
                      {t.home.sourceBadges[fact.verificationType]}
                    </Badge>
                    <p className="prose-serif mt-3 text-charcoal-800">{fact.text}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* How to help */}
      <section aria-labelledby="how-to-help" className="border-t border-charcoal-200 py-12">
        <h2 id="how-to-help" className="text-2xl font-semibold">
          {t.howToHelp.title}
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { text: t.howToHelp.review, href: "/witness" },
            { text: t.howToHelp.share, href: "/share" },
            { text: t.howToHelp.contact, href: "/submit-information" },
          ].map((item, index) => (
            <li key={item.href}>
              <Link href={item.href} className="block h-full">
                <Card className="h-full transition-colors hover:border-steel-600">
                  <CardContent className="flex items-start gap-4 pt-5">
                    <span
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-charcoal-900 text-sm font-bold text-paper"
                    >
                      {index + 1}
                    </span>
                    <p className="text-charcoal-800">{item.text}</p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* Latest verified update */}
      <section aria-labelledby="latest-update" className="border-t border-charcoal-200 py-12">
        <h2 id="latest-update" className="text-2xl font-semibold">
          {t.home.latestUpdate}
        </h2>
        {latestUpdate ? (
          <Card className="mt-6 max-w-2xl">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={latestUpdate.verificationType}>
                  {t.home.sourceBadges[latestUpdate.verificationType]}
                </Badge>
                <span className="text-sm text-charcoal-500">
                  {formatDateISO(latestUpdate.sourceDate, locale)}
                </span>
              </div>
              <CardTitle>{latestUpdate.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="prose-serif text-charcoal-800">{latestUpdate.body}</p>
            </CardContent>
          </Card>
        ) : (
          <p className="prose-serif mt-4 max-w-prose text-charcoal-600">{t.home.noUpdates}</p>
        )}
      </section>
    </div>
  );
}
