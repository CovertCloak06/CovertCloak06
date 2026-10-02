import type { Metadata } from "next";
import { ShareKit } from "@/components/site/share-kit";
import { getCaseInfo, getWitnessAsset } from "@/lib/data/public";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share the Case" };

export default async function SharePage() {
  const [{ t }, caseInfo, asset] = await Promise.all([
    getT(),
    getCaseInfo(),
    getWitnessAsset(),
  ]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://justiceforkevin.org";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t.share.title}</h1>
      <p className="prose-serif mt-3 max-w-prose text-charcoal-700">{t.share.intro}</p>
      <div className="mt-8">
        <ShareKit
          caseInfo={caseInfo}
          siteUrl={siteUrl}
          witnessImageUrl={asset?.publicUrl ?? null}
        />
      </div>
    </div>
  );
}
