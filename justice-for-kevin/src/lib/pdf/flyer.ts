import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import type { CaseInfo } from "@/lib/case";
import { qrPngBytes } from "@/lib/qr";

/**
 * Print-ready flyer generation. Sizes are expressed in PDF points (72/inch);
 * vector text and a high-resolution QR keep output 300-DPI-ready. Layout is
 * grayscale-compatible (charcoal ink, no color-dependent information).
 */

export const FLYER_SIZES = {
  letter_portrait: { label: "US Letter portrait", width: 612, height: 792 },
  letter_landscape: { label: "US Letter landscape", width: 792, height: 612 },
  half_sheet: { label: "Half-sheet", width: 612, height: 396 },
  quarter_sheet: { label: "Quarter-sheet", width: 306, height: 396 },
  poster_11x17: { label: "11 × 17 poster", width: 792, height: 1224 },
  handout_4x6: { label: "4 × 6 handout", width: 288, height: 432 },
  business_card: { label: "Business card", width: 252, height: 144 },
} as const;

export type FlyerSizeKey = keyof typeof FLYER_SIZES;

export type FlyerOptions = {
  size: FlyerSizeKey;
  headline: string;
  body: string;
  siteUrl: string;
  campaignSrc?: string;
  lastUpdatedIso: string;
  language: "en" | "es";
  imageBytes?: Uint8Array;
  imageMime?: string;
  showDetectiveContact?: boolean;
  showQr?: boolean;
};

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

export async function generateFlyerPdf(
  caseInfo: CaseInfo,
  options: FlyerOptions,
): Promise<Uint8Array> {
  const spec = FLYER_SIZES[options.size];
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${caseInfo.victimName} — ${options.headline}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([spec.width, spec.height]);
  const isTiny = options.size === "business_card";
  const margin = isTiny ? 12 : Math.max(24, spec.width * 0.06);
  const ink = rgb(0.1, 0.11, 0.13);
  const accent = rgb(0.25, 0.4, 0.53);
  const contentWidth = spec.width - margin * 2;
  const scale = Math.min(1.6, Math.max(0.62, spec.width / 612));

  let cursorY = spec.height - margin;

  const drawWrapped = (
    text: string,
    textFont: PDFFont,
    size: number,
    lineGap = 1.25,
  ) => {
    for (const line of wrap(text, textFont, size, contentWidth)) {
      cursorY -= size * lineGap;
      if (cursorY < margin) return;
      page.drawText(line, { x: margin, y: cursorY, size, font: textFont, color: ink });
    }
  };

  // Headline
  drawWrapped(options.headline.toUpperCase(), bold, (isTiny ? 9 : 22) * scale, 1.15);
  cursorY -= 6 * scale;
  page.drawLine({
    start: { x: margin, y: cursorY },
    end: { x: spec.width - margin, y: cursorY },
    thickness: isTiny ? 1 : 2,
    color: accent,
  });
  cursorY -= 8 * scale;

  // Witness image (official public copy only)
  if (options.imageBytes && !isTiny) {
    let image: PDFImage | null = null;
    try {
      image = options.imageMime?.includes("png")
        ? await pdf.embedPng(options.imageBytes)
        : await pdf.embedJpg(options.imageBytes);
    } catch {
      image = null;
    }
    if (image) {
      const maxHeight = spec.height * 0.34;
      const ratio = Math.min(contentWidth / image.width, maxHeight / image.height);
      const width = image.width * ratio;
      const height = image.height * ratio;
      cursorY -= height;
      page.drawImage(image, {
        x: margin + (contentWidth - width) / 2,
        y: cursorY,
        width,
        height,
      });
      cursorY -= 6 * scale;
      const caption =
        options.language === "es"
          ? "Posible testigo — imagen difundida por la policía"
          : "Potential witness — image released by law enforcement";
      drawWrapped(caption, font, 8 * scale);
      cursorY -= 4 * scale;
    }
  }

  // Body
  if (!isTiny) {
    drawWrapped(options.body, font, 10.5 * scale, 1.35);
    cursorY -= 8 * scale;
  }

  // Case facts block
  const facts = [
    `${caseInfo.victimName} — ${options.language === "es" ? "Edad" : "Age"} ${caseInfo.victimAge}`,
    options.language === "es" ? "11 de julio de 2024" : "July 11, 2024",
    caseInfo.incidentLocation,
    `${options.language === "es" ? "Caso" : "Case"} ${caseInfo.caseNumber}`,
  ];
  for (const fact of facts) {
    drawWrapped(fact, bold, (isTiny ? 6.5 : 11) * scale, 1.25);
  }
  cursorY -= 4 * scale;

  if (options.showDetectiveContact !== false) {
    drawWrapped(
      `${caseInfo.investigatorName} · ${caseInfo.investigatorPhone}`,
      bold,
      (isTiny ? 6.5 : 12) * scale,
    );
    drawWrapped(caseInfo.investigatorEmail, font, (isTiny ? 6 : 10.5) * scale);
  }

  // QR code bottom-right
  if (options.showQr !== false) {
    const qrTarget = new URL(`${options.siteUrl.replace(/\/+$/, "")}/witness`);
    if (options.campaignSrc) qrTarget.searchParams.set("src", options.campaignSrc);
    const qrImage = await pdf.embedPng(await qrPngBytes(qrTarget.toString()));
    const qrSize = isTiny ? 52 : Math.min(120 * scale, spec.width * 0.22);
    page.drawImage(qrImage, {
      x: spec.width - margin - qrSize,
      y: margin,
      width: qrSize,
      height: qrSize,
    });
  }

  // Footer: site URL + last updated
  const updatedLabel = options.language === "es" ? "Actualizado" : "Last updated";
  page.drawText(
    `${options.siteUrl.replace(/^https?:\/\//, "")} · ${updatedLabel}: ${options.lastUpdatedIso.slice(0, 10)}`,
    { x: margin, y: margin / 2, size: isTiny ? 5 : 8, font, color: rgb(0.4, 0.43, 0.47) },
  );

  return pdf.save();
}
