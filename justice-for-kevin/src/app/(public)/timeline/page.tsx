import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { getTimelineEntries } from "@/lib/data/public";
import { getT } from "@/lib/i18n/server";
import { formatDateISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verified Timeline" };

export default async function TimelinePage() {
  const [{ t, locale }, entries] = await Promise.all([getT(), getTimelineEntries()]);

  const groups = [
    { type: "law_enforcement" as const, items: entries.filter((entry) => entry.verificationType === "law_enforcement" || entry.verificationType === "official_record") },
    { type: "media" as const, items: entries.filter((entry) => entry.verificationType === "media") },
    { type: "campaign" as const, items: entries.filter((entry) => entry.verificationType === "campaign") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t.nav.timeline}</h1>
      <p className="prose-serif mt-2 text-charcoal-600">
        {t.home.sourceBadges.law_enforcement} · {t.home.sourceBadges.media} ·{" "}
        {t.home.sourceBadges.campaign}
      </p>

      {entries.length === 0 ? (
        <p className="prose-serif mt-8 text-charcoal-600">{t.home.noUpdates}</p>
      ) : (
        groups
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <section key={group.type} aria-label={t.home.sourceBadges[group.type]} className="mt-10">
              <h2 className="text-xl font-semibold">
                <Badge variant={group.type} className="text-sm">
                  {t.home.sourceBadges[group.type]}
                </Badge>
              </h2>
              <ol className="mt-4 space-y-0 border-l-2 border-charcoal-200">
                {group.items.map((entry) => (
                  <li key={entry.id} className="relative pb-8 pl-6">
                    <span
                      aria-hidden
                      className="absolute -left-[7px] top-1.5 size-3 rounded-full border-2 border-white bg-steel-600"
                    />
                    <time className="text-sm font-semibold text-charcoal-500" dateTime={entry.eventDate}>
                      {formatDateISO(entry.eventDate, locale)}
                    </time>
                    <h3 className="mt-0.5 font-semibold text-charcoal-900">{entry.title}</h3>
                    <p className="prose-serif mt-1 text-charcoal-700">{entry.summary}</p>
                    {entry.correctionNote ? (
                      <p className="mt-2 rounded border border-charcoal-200 bg-charcoal-50 p-2 text-sm text-charcoal-600">
                        Correction{entry.correctedAt ? ` (${formatDateISO(entry.correctedAt, locale)})` : ""}: {entry.correctionNote}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ))
      )}
    </div>
  );
}
