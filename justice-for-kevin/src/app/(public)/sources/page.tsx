import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicSources } from "@/lib/data/public";
import { getT } from "@/lib/i18n/server";
import { formatDateISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sources" };

const TYPE_BADGE: Record<string, "law_enforcement" | "official_record" | "media" | "campaign" | "neutral"> = {
  law_enforcement: "law_enforcement",
  official_record: "official_record",
  media: "media",
  campaign: "campaign",
};

export default async function SourcesPage() {
  const [{ t, locale }, sources] = await Promise.all([getT(), getPublicSources()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t.nav.sources}</h1>
      <p className="prose-serif mt-2 text-charcoal-600">
        Official and media sources used by this site, with verification status and review dates.
      </p>

      {sources.length === 0 ? (
        <p className="prose-serif mt-6 text-charcoal-600">{t.home.noUpdates}</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {sources.map((source) => (
            <li key={source.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={TYPE_BADGE[source.sourceType] ?? "neutral"}>
                      {t.home.sourceBadges[source.sourceType as keyof typeof t.home.sourceBadges] ?? source.sourceType}
                    </Badge>
                    <Badge variant="status">{source.verificationStatus.replaceAll("_", " ")}</Badge>
                  </div>
                  <CardTitle className="text-base">{source.title}</CardTitle>
                  <p className="text-sm text-charcoal-600">{source.publisher}</p>
                </CardHeader>
                <CardContent>
                  {source.summary ? (
                    <p className="prose-serif text-sm text-charcoal-800">{source.summary}</p>
                  ) : null}
                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-charcoal-500">
                    {source.publicationDate ? (
                      <div>Published {formatDateISO(source.publicationDate, locale)}</div>
                    ) : null}
                    {source.accessedDate ? (
                      <div>Accessed {formatDateISO(source.accessedDate, locale)}</div>
                    ) : null}
                    {source.lastReviewedAt ? (
                      <div>
                        {t.footer.lastReviewed} {formatDateISO(source.lastReviewedAt, locale)}
                      </div>
                    ) : null}
                  </dl>
                  {source.originalUrl ? (
                    <a
                      href={source.originalUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-steel-700 underline-offset-2 hover:underline"
                    >
                      <ExternalLink aria-hidden className="size-4" />
                      Original source
                    </a>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
