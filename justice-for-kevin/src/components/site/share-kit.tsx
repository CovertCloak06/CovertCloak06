"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/field";
import { trackEvent } from "@/lib/analytics";
import type { CaseInfo } from "@/lib/case";
import { qrDataUrl, sanitizeCampaignSrc } from "@/lib/qr";
import {
  buildShareText,
  DEFAULT_BODY,
  DEFAULT_HEADLINE,
  type ShareFormat,
} from "@/lib/share-templates";

const FORMATS: { value: ShareFormat; label: string; graphic?: { width: number; height: number } }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram_square", label: "Instagram square", graphic: { width: 1080, height: 1080 } },
  { value: "instagram_story", label: "Instagram story", graphic: { width: 1080, height: 1920 } },
  { value: "x", label: "X" },
  { value: "nextdoor", label: "Nextdoor" },
  { value: "reddit", label: "Reddit" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
];

export function ShareKit({
  caseInfo,
  siteUrl,
  witnessImageUrl,
}: {
  caseInfo: CaseInfo;
  siteUrl: string;
  witnessImageUrl: string | null;
}) {
  const [format, setFormat] = useState<ShareFormat>("facebook");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [headline, setHeadline] = useState(DEFAULT_HEADLINE.en);
  const [body, setBody] = useState(DEFAULT_BODY.en);
  const [detailed, setDetailed] = useState(false);
  const [includeContact, setIncludeContact] = useState(true);
  const [includeQr, setIncludeQr] = useState(true);
  const [darkLayout, setDarkLayout] = useState(true);
  const [campaignSrc, setCampaignSrc] = useState("");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setHeadline(DEFAULT_HEADLINE[language]);
    setBody(DEFAULT_BODY[language]);
  }, [language]);

  const text = buildShareText({
    format,
    caseInfo,
    headline,
    body,
    language,
    siteUrl,
    includeDetectiveContact: includeContact,
    detailed,
  });

  const graphicSpec = FORMATS.find((entry) => entry.value === format)?.graphic;

  const drawGraphic = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !graphicSpec) return;
    canvas.width = graphicSpec.width;
    canvas.height = graphicSpec.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bg = darkLayout ? "#1a1d21" : "#faf9f6";
    const ink = darkLayout ? "#faf9f6" : "#1a1d21";
    const accent = "#4f7899";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const margin = canvas.width * 0.07;
    let cursorY = margin * 1.4;

    // Headline
    ctx.fillStyle = ink;
    ctx.font = `bold ${Math.round(canvas.width * 0.055)}px Inter, Arial, sans-serif`;
    ctx.textBaseline = "top";
    const words = headline.toUpperCase().split(" ");
    let line = "";
    const maxWidth = canvas.width - margin * 2;
    const lineHeight = canvas.width * 0.07;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line, margin, cursorY);
        cursorY += lineHeight;
        line = word;
      } else {
        line = candidate;
      }
    }
    ctx.fillText(line, margin, cursorY);
    cursorY += lineHeight * 1.4;

    ctx.fillStyle = accent;
    ctx.fillRect(margin, cursorY, maxWidth, 6);
    cursorY += margin * 0.6;

    // Witness image
    if (witnessImageUrl) {
      try {
        const image = new Image();
        image.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("image load failed"));
          image.src = witnessImageUrl;
        });
        const maxImageHeight = canvas.height * (graphicSpec.height > graphicSpec.width ? 0.4 : 0.42);
        const ratio = Math.min(maxWidth / image.width, maxImageHeight / image.height);
        const width = image.width * ratio;
        const height = image.height * ratio;
        ctx.drawImage(image, margin + (maxWidth - width) / 2, cursorY, width, height);
        cursorY += height + margin * 0.4;
      } catch {
        // no image — continue with text-only layout
      }
    }

    // Case facts
    ctx.fillStyle = ink;
    const factSize = Math.round(canvas.width * 0.034);
    ctx.font = `bold ${factSize}px Inter, Arial, sans-serif`;
    const facts = [
      `${caseInfo.victimName} — ${language === "es" ? "Edad" : "Age"} ${caseInfo.victimAge}`,
      language === "es" ? "11 de julio de 2024" : "July 11, 2024",
      caseInfo.incidentLocation,
      `${language === "es" ? "Caso" : "Case"} ${caseInfo.caseNumber}`,
    ];
    for (const fact of facts) {
      ctx.fillText(fact, margin, cursorY, maxWidth);
      cursorY += factSize * 1.5;
    }
    if (includeContact) {
      cursorY += factSize * 0.5;
      ctx.fillText(`${caseInfo.investigatorName} · ${caseInfo.investigatorPhone}`, margin, cursorY, maxWidth);
      cursorY += factSize * 1.5;
      ctx.font = `${factSize}px Inter, Arial, sans-serif`;
      ctx.fillText(caseInfo.investigatorEmail, margin, cursorY, maxWidth);
      cursorY += factSize * 1.6;
    }

    // QR + URL footer
    const displayUrl = siteUrl.replace(/^https?:\/\//, "") + "/witness";
    if (includeQr) {
      const qrTarget = new URL(`${siteUrl.replace(/\/+$/, "")}/witness`);
      const slug = sanitizeCampaignSrc(campaignSrc);
      if (slug) qrTarget.searchParams.set("src", slug);
      const qrSize = canvas.width * 0.2;
      const qrImage = new Image();
      await new Promise<void>((resolve) => {
        qrImage.onload = () => resolve();
        qrImage.onerror = () => resolve();
        qrDataUrl(qrTarget.toString(), Math.round(qrSize * 2)).then((url) => {
          qrImage.src = url;
        });
      });
      if (qrImage.width) {
        ctx.drawImage(
          qrImage,
          canvas.width - margin - qrSize,
          canvas.height - margin - qrSize,
          qrSize,
          qrSize,
        );
      }
    }
    ctx.font = `${Math.round(canvas.width * 0.026)}px Inter, Arial, sans-serif`;
    ctx.fillStyle = darkLayout ? "#aab3bf" : "#5d6672";
    ctx.fillText(displayUrl, margin, canvas.height - margin * 0.8, maxWidth * 0.7);
  }, [graphicSpec, darkLayout, headline, witnessImageUrl, caseInfo, language, includeContact, includeQr, siteUrl, campaignSrc]);

  useEffect(() => {
    if (graphicSpec) void drawGraphic();
  }, [graphicSpec, drawGraphic]);

  const copyText = async () => {
    await navigator.clipboard.writeText(text);
    trackEvent("share_click", { method: format });
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const downloadGraphic = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    trackEvent("share_click", { method: `${format}_graphic` });
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = `justice-for-kevin-${format}.png`;
    anchor.click();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
      <Card>
        <CardContent className="space-y-5 pt-5">
          <div>
            <Label htmlFor="share-format">Format</Label>
            <Select
              id="share-format"
              className="mt-1.5"
              value={format}
              onChange={(event) => setFormat(event.target.value as ShareFormat)}
            >
              {FORMATS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="share-language">Language</Label>
            <Select
              id="share-language"
              className="mt-1.5"
              value={language}
              onChange={(event) => setLanguage(event.target.value as "en" | "es")}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="share-headline">Headline</Label>
            <Input
              id="share-headline"
              className="mt-1.5"
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="share-body">Description</Label>
            <Textarea
              id="share-body"
              className="mt-1.5 min-h-28"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="share-src">
              Campaign source tag (QR tracking, optional)
            </Label>
            <Input
              id="share-src"
              className="mt-1.5"
              placeholder="flyer-antioch-market-001"
              value={campaignSrc}
              onChange={(event) => setCampaignSrc(event.target.value)}
            />
          </div>
          <fieldset className="space-y-2.5">
            <legend className="sr-only">Options</legend>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox checked={detailed} onChange={(event) => setDetailed(event.target.checked)} />
              Detailed description
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox checked={includeContact} onChange={(event) => setIncludeContact(event.target.checked)} />
              Show detective contact
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox checked={includeQr} onChange={(event) => setIncludeQr(event.target.checked)} />
              <span className="inline-flex items-center gap-1.5">
                <QrCode aria-hidden className="size-4" /> Include QR code (graphics)
              </span>
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox checked={darkLayout} onChange={(event) => setDarkLayout(event.target.checked)} />
              Dark layout (graphics)
            </label>
          </fieldset>
          <p className="text-sm text-charcoal-600">
            For printable flyers, half-sheets, and QR cards use the{" "}
            <Link href="/flyers" className="underline underline-offset-2">
              flyer generator
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold">Preview</h2>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-charcoal-200 bg-white p-4 text-sm leading-relaxed">
          {text}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={copyText}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy text"}
          </Button>
          {graphicSpec ? (
            <Button variant="outline" className="bg-white" onClick={downloadGraphic}>
              <Download aria-hidden /> Download graphic (PNG)
            </Button>
          ) : null}
        </div>
        <span aria-live="polite" className="sr-only">{copied ? "Share text copied" : ""}</span>

        {graphicSpec ? (
          <div className="mt-6">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`${headline} — share graphic preview`}
              className="w-full max-w-sm rounded-lg border border-charcoal-200"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
