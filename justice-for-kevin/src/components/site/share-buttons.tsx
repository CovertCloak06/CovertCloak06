"use client";

import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

export function ShareButtons({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    trackEvent("share_click", { method: "native" });
    const url = window.location.origin + "/witness";
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    await copy(url);
  };

  const copy = async (url?: string) => {
    trackEvent("share_click", { method: "copy" });
    await navigator.clipboard.writeText(url ?? window.location.origin + "/witness");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Share">
      <Button variant="primary" onClick={share}>
        <Share2 aria-hidden /> {title}
      </Button>
      <Button variant="outline" onClick={() => copy()}>
        {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </div>
  );
}
