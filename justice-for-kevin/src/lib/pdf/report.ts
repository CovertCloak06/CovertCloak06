import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CaseInfo } from "@/lib/case";
import type { TipSubmission } from "@/lib/tip-schema";
import { formatTipReport } from "@/lib/report";

const PAGE_WIDTH = 612; // US Letter portrait, points
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const BODY_SIZE = 10;
const LINE_HEIGHT = 14;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        // Hard-break very long tokens (hashes, URLs).
        let chunk = word;
        while (font.widthOfTextAtSize(chunk, size) > maxWidth) {
          let cut = chunk.length;
          while (cut > 1 && font.widthOfTextAtSize(chunk.slice(0, cut), size) > maxWidth) {
            cut -= 1;
          }
          lines.push(chunk.slice(0, cut));
          chunk = chunk.slice(cut);
        }
        current = chunk;
      }
    }
    lines.push(current);
  }
  return lines;
}

/**
 * Generate the structured information report as a PDF: case header,
 * generation date, page numbers, attachment manifest with SHA-256 integrity
 * hashes, privacy notice, and detective contact information.
 */
export async function generateReportPdf(
  tip: TipSubmission,
  caseInfo: CaseInfo,
  generatedAtIso: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Information Report — Case ${caseInfo.caseNumber}`);
  pdf.setSubject(`Structured community information report for case ${caseInfo.caseNumber}`);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  const pages: PDFPage[] = [];
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  let cursorY = PAGE_HEIGHT - MARGIN;

  const newPageIfNeeded = (needed: number) => {
    if (cursorY - needed < MARGIN + 30) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      cursorY = PAGE_HEIGHT - MARGIN;
    }
  };

  const drawLine = (text: string, useBold = false, size = BODY_SIZE) => {
    newPageIfNeeded(LINE_HEIGHT);
    page.drawText(text, {
      x: MARGIN,
      y: cursorY - size,
      size,
      font: useBold ? bold : font,
      color: rgb(0.1, 0.11, 0.13),
    });
    cursorY -= LINE_HEIGHT;
  };

  // Header
  drawLine("STRUCTURED INFORMATION REPORT", true, 15);
  cursorY -= 4;
  drawLine(`Case ${caseInfo.caseNumber} — ${caseInfo.victimName} Homicide Investigation`, true, 11);
  drawLine(`Generated: ${generatedAtIso}`, false, 9);
  cursorY -= 6;
  page.drawLine({
    start: { x: MARGIN, y: cursorY },
    end: { x: PAGE_WIDTH - MARGIN, y: cursorY },
    thickness: 1,
    color: rgb(0.25, 0.4, 0.53),
  });
  cursorY -= 12;

  // Body: the canonical plain-text report, wrapped.
  const body = formatTipReport(tip, caseInfo, generatedAtIso);
  for (const line of wrapText(body, font, BODY_SIZE, maxWidth)) {
    const isHeading = /^[A-Z][A-Z0-9 /—-]+:$/.test(line.trim());
    drawLine(line, isHeading);
  }

  // Privacy notice + detective block
  cursorY -= 10;
  newPageIfNeeded(LINE_HEIGHT * 6);
  page.drawLine({
    start: { x: MARGIN, y: cursorY },
    end: { x: PAGE_WIDTH - MARGIN, y: cursorY },
    thickness: 0.5,
    color: rgb(0.7, 0.72, 0.75),
  });
  cursorY -= 12;
  drawLine("PRIVACY NOTICE", true, 9);
  for (const line of wrapText(
    "This report was prepared by a community member for delivery to law enforcement. It may contain personal information; handle accordingly. Prepared reports are not stored by the campaign website unless secure intake is enabled. This is not an emergency reporting system — call 911 in an emergency.",
    font,
    8.5,
    maxWidth,
  )) {
    drawLine(line, false, 8.5);
  }
  cursorY -= 6;
  drawLine("DELIVER TO", true, 9);
  drawLine(
    `${caseInfo.investigatorName}, Badge #${caseInfo.investigatorBadge} — ${caseInfo.investigatingAgency}`,
    false,
    9,
  );
  drawLine(`${caseInfo.investigatorPhone} · ${caseInfo.investigatorEmail}`, false, 9);

  // Page numbers + footer case reference on every page
  pages.forEach((pageRef, index) => {
    pageRef.drawText(
      `Case ${caseInfo.caseNumber} · Page ${index + 1} of ${pages.length}`,
      {
        x: MARGIN,
        y: MARGIN / 2,
        size: 8,
        font,
        color: rgb(0.45, 0.48, 0.52),
      },
    );
  });

  return pdf.save();
}
