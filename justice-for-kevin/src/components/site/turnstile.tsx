"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

type TurnstileGlobal = {
  render: (
    element: HTMLElement,
    options: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void },
  ) => string;
};

/** Cloudflare Turnstile widget. Renders nothing when no site key is
 * configured (server-side verification is skipped and logged in that case). */
export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || rendered.current) return;
    const tryRender = () => {
      const turnstile = (window as unknown as { turnstile?: TurnstileGlobal }).turnstile;
      if (turnstile && containerRef.current && !rendered.current) {
        rendered.current = true;
        turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: onToken,
        });
      }
    };
    tryRender();
    const interval = setInterval(tryRender, 500);
    return () => clearInterval(interval);
  }, [siteKey, onToken]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div ref={containerRef} aria-label="Verification challenge" />
    </>
  );
}
