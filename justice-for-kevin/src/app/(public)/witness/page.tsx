import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CaseReferenceBox } from "@/components/site/case-reference";
import { DetectiveActions, StickyActionBar } from "@/components/site/detective-actions";
import { ImageViewer } from "@/components/site/image-viewer";
import { ShareButtons } from "@/components/site/share-buttons";
import { getCaseInfo, getWitnessAsset } from "@/lib/data/public";
import { getT } from "@/lib/i18n/server";
import { formatDateISO } from "@/lib/utils";
import { recordQrScan } from "@/lib/data/qr";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Witness Information" };

export default async function WitnessPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>;
}) {
  const [{ t, locale }, caseInfo, asset, params] = await Promise.all([
    getT(),
    getCaseInfo(),
    getWitnessAsset(),
    searchParams,
  ]);

  // Aggregate-only campaign scan tracking (no GPS, no fingerprinting).
  if (params.src) {
    await recordQrScan(params.src);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 md:pb-8">
      <div className="py-10">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t.witness.title}</h1>
        <p className="prose-serif mt-2 max-w-prose text-lg text-charcoal-700">{t.witness.role}</p>
      </div>

      <div
        role="note"
        className="mb-8 flex items-start gap-3 rounded-lg border border-urgent-700 bg-urgent-100 p-4"
      >
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-urgent-700" />
        <p className="font-medium text-charcoal-900">{t.witness.notice}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <section aria-label={t.witness.title}>
          {asset ? (
            <>
              <ImageViewer
                src={asset.publicUrl}
                alt={asset.description || t.witness.imageAlt}
                downloadLabel={t.witness.download}
                zoomInLabel={t.witness.zoomIn}
                zoomOutLabel={t.witness.zoomOut}
                resetLabel={t.witness.reset}
                fullscreenLabel={t.witness.fullscreen}
              />
              <dl className="mt-4 grid gap-1.5 text-sm text-charcoal-700">
                {asset.releasedOn ? (
                  <div className="flex gap-2">
                    <dt className="font-semibold">{t.witness.releasedOn}:</dt>
                    <dd>{formatDateISO(asset.releasedOn, locale)}</dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt className="font-semibold">{t.witness.agencySource}:</dt>
                  <dd>{asset.agencySource || caseInfo.investigatingAgency}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-semibold">{t.hero.caseNumber}:</dt>
                  <dd>{caseInfo.caseNumber}</dd>
                </div>
              </dl>
              <p className="mt-3 text-sm text-charcoal-600">
                {t.witness.imageQuality}{" "}
                <Link href="/sources" className="underline underline-offset-2">
                  {t.witness.sourceInfo}
                </Link>
              </p>
            </>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-charcoal-300 bg-charcoal-50 p-8 text-center text-charcoal-600">
              <p className="max-w-md">{t.witness.noImage}</p>
            </div>
          )}

          <div className="mt-6">
            <ShareButtons title={t.hero.helpIdentify} />
          </div>
        </section>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.witness.checklistTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-charcoal-600">{t.witness.checklistIntro}</p>
              <ul className="mt-3 space-y-2.5">
                {t.witness.checklist.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-steel-600" />
                    <span className="text-charcoal-800">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-charcoal-600">
                <Badge variant="neutral">{t.witness.checklistNote}</Badge>
              </p>
            </CardContent>
          </Card>

          <CaseReferenceBox caseInfo={caseInfo} t={t} />

          <div className="hidden md:block">
            <DetectiveActions
              caseInfo={caseInfo}
              callLabel={t.hero.callDetective}
              emailLabel={t.hero.emailDetective}
            />
          </div>
        </div>
      </div>

      <StickyActionBar
        caseInfo={caseInfo}
        callLabel={t.hero.callDetective}
        emailLabel={t.hero.emailDetective}
      />
    </div>
  );
}
