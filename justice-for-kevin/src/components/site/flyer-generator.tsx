"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/field";
import { trackEvent } from "@/lib/analytics";
import type { CaseInfo } from "@/lib/case";
import { FLYER_SIZES, generateFlyerPdf, type FlyerSizeKey } from "@/lib/pdf/flyer";
import { sanitizeCampaignSrc } from "@/lib/qr";
import { DEFAULT_BODY, DEFAULT_HEADLINE } from "@/lib/share-templates";

export function FlyerGenerator({
  caseInfo,
  siteUrl,
  witnessImageUrl,
}: {
  caseInfo: CaseInfo;
  siteUrl: string;
  witnessImageUrl: string | null;
}) {
  const [size, setSize] = useState<FlyerSizeKey>("letter_portrait");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [headline, setHeadline] = useState(DEFAULT_HEADLINE.en);
  const [body, setBody] = useState(DEFAULT_BODY.en);
  const [campaignSrc, setCampaignSrc] = useState("");
  const [includeImage, setIncludeImage] = useState(true);
  const [showContact, setShowContact] = useState(true);
  const [showQr, setShowQr] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchLanguage = (next: "en" | "es") => {
    setLanguage(next);
    setHeadline(DEFAULT_HEADLINE[next]);
    setBody(DEFAULT_BODY[next]);
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      let imageBytes: Uint8Array | undefined;
      let imageMime: string | undefined;
      if (includeImage && witnessImageUrl) {
        try {
          const response = await fetch(witnessImageUrl);
          if (response.ok) {
            imageBytes = new Uint8Array(await response.arrayBuffer());
            imageMime = response.headers.get("content-type") ?? "image/jpeg";
          }
        } catch {
          // proceed without image
        }
      }

      const bytes = await generateFlyerPdf(caseInfo, {
        size,
        headline,
        body,
        siteUrl,
        campaignSrc: sanitizeCampaignSrc(campaignSrc) || undefined,
        lastUpdatedIso: new Date().toISOString(),
        language,
        imageBytes,
        imageMime,
        showDetectiveContact: showContact,
        showQr,
      });

      trackEvent("flyer_download", { size });
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `justice-for-kevin-flyer-${size}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError("Could not generate the flyer. Try again.");
      console.error(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="flyer-size">Size</Label>
            <Select
              id="flyer-size"
              className="mt-1.5"
              value={size}
              onChange={(event) => setSize(event.target.value as FlyerSizeKey)}
            >
              {Object.entries(FLYER_SIZES).map(([key, spec]) => (
                <option key={key} value={key}>
                  {spec.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="flyer-language">Language</Label>
            <Select
              id="flyer-language"
              className="mt-1.5"
              value={language}
              onChange={(event) => switchLanguage(event.target.value as "en" | "es")}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="flyer-headline">Headline</Label>
          <Input
            id="flyer-headline"
            className="mt-1.5"
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="flyer-body">Description</Label>
          <Textarea
            id="flyer-body"
            className="mt-1.5 min-h-24"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="flyer-src">Campaign source tag (QR tracking, optional)</Label>
          <Input
            id="flyer-src"
            className="mt-1.5"
            placeholder="flyer-antioch-market-001"
            value={campaignSrc}
            onChange={(event) => setCampaignSrc(event.target.value)}
          />
        </div>
        <fieldset className="space-y-2.5">
          <legend className="sr-only">Options</legend>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox
              checked={includeImage}
              disabled={!witnessImageUrl}
              onChange={(event) => setIncludeImage(event.target.checked)}
            />
            Include official witness image{witnessImageUrl ? "" : " (not yet published)"}
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox checked={showContact} onChange={(event) => setShowContact(event.target.checked)} />
            Show detective contact
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox checked={showQr} onChange={(event) => setShowQr(event.target.checked)} />
            Include QR code
          </label>
        </fieldset>
        {error ? (
          <p role="alert" className="rounded-lg border border-urgent-700 bg-urgent-100 p-3 text-sm">
            {error}
          </p>
        ) : null}
        <Button variant="primary" size="lg" onClick={generate} disabled={busy}>
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Download aria-hidden />}
          {busy ? "Generating…" : "Generate PDF"}
        </Button>
        <p className="text-xs text-charcoal-500">
          Flyers use printer-safe margins, grayscale-compatible ink, vector text, and a
          high-resolution QR code suitable for 300 DPI printing.
        </p>
      </CardContent>
    </Card>
  );
}
