import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicUpdates } from "@/lib/data/public";
import { getT } from "@/lib/i18n/server";
import { formatDateISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Updates" };

export default async function UpdatesPage() {
  const [{ t, locale }, updates] = await Promise.all([getT(), getPublicUpdates(50)]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t.nav.updates}</h1>
      {updates.length === 0 ? (
        <p className="prose-serif mt-6 text-charcoal-600">{t.home.noUpdates}</p>
      ) : (
        <ul className="mt-8 space-y-5">
          {updates.map((update) => (
            <li key={update.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={update.verificationType}>
                      {t.home.sourceBadges[update.verificationType]}
                    </Badge>
                    <time className="text-sm text-charcoal-500" dateTime={update.sourceDate}>
                      {formatDateISO(update.sourceDate, locale)}
                    </time>
                  </div>
                  <CardTitle>{update.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="prose-serif whitespace-pre-line text-charcoal-800">{update.body}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
