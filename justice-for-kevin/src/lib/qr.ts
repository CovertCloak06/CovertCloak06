import QRCode from "qrcode";

/**
 * Campaign QR helpers. QR codes point at the public witness page with a
 * `src` campaign parameter, e.g. https://domain/witness?src=flyer-antioch-market-001
 * Scan tracking is aggregate-only (no precise GPS, no fingerprinting).
 */

export type CampaignLink = {
  url: string;
  src: string | null;
};

export function buildCampaignUrl(siteUrl: string, src?: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/witness`);
  if (src) url.searchParams.set("src", sanitizeCampaignSrc(src));
  return url.toString();
}

/** Campaign source slugs: lowercase alphanumerics and dashes only. */
export function sanitizeCampaignSrc(src: string): string {
  return src
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/** Parse the campaign source from a request URL for aggregate scan logging. */
export function parseCampaignLink(rawUrl: string): CampaignLink {
  try {
    const url = new URL(rawUrl);
    const src = url.searchParams.get("src");
    return { url: rawUrl, src: src ? sanitizeCampaignSrc(src) : null };
  } catch {
    return { url: rawUrl, src: null };
  }
}

export async function qrDataUrl(text: string, sizePx = 512): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    width: sizePx,
    margin: 2,
    color: { dark: "#1a1d21", light: "#ffffff" },
  });
}

/** Raw PNG bytes for embedding into PDF flyers at print resolution. */
export async function qrPngBytes(text: string, sizePx = 1200): Promise<Uint8Array> {
  const dataUrl = await qrDataUrl(text, sizePx);
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
