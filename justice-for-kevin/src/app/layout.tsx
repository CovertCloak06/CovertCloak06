import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: {
    default: "Unbroken: The Fight for Kevin — Community Information Hub",
    template: "%s — Unbroken: The Fight for Kevin",
  },
  description:
    "Community Information Hub for the Kevin Vandenbos Homicide Investigation. Help Antioch Police identify a potential witness. Case 24-6070.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const analyticsUrl = process.env.NEXT_PUBLIC_ANALYTICS_URL;
  const analyticsSiteId = process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID;

  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col">
        {children}
        {analyticsUrl && analyticsSiteId ? (
          <Script
            src={`${analyticsUrl.replace(/\/$/, "")}/script.js`}
            data-website-id={analyticsSiteId}
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
