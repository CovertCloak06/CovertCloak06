import type { Dictionary } from "@/lib/i18n";
import type { CaseInfo } from "@/lib/case";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CaseReferenceBox({ caseInfo, t }: { caseInfo: CaseInfo; t: Dictionary }) {
  return (
    <Card aria-label={t.home.caseReference} className="border-steel-600 bg-steel-100/40">
      <CardHeader>
        <CardTitle className="text-base">{t.home.caseReference}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="font-semibold">{t.hero.caseNumber}:</dt>
            <dd>{caseInfo.caseNumber}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">{t.home.detective}:</dt>
            <dd>{caseInfo.investigatorName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">{t.home.badge}:</dt>
            <dd>#{caseInfo.investigatorBadge}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">{t.home.phone}:</dt>
            <dd>
              <a className="underline underline-offset-2" href={`tel:+1${caseInfo.investigatorPhone.replace(/\D/g, "")}`}>
                {caseInfo.investigatorPhone}
              </a>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">{t.home.email}:</dt>
            <dd>
              <a className="underline underline-offset-2" href={`mailto:${caseInfo.investigatorEmail}`}>
                {caseInfo.investigatorEmail}
              </a>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function SourceBadgeLabel({
  type,
  t,
}: {
  type: "law_enforcement" | "official_record" | "media" | "campaign";
  t: Dictionary;
}) {
  return t.home.sourceBadges[type];
}
