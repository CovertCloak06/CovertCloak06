"use client";

import { Mail, Phone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { detectiveMailtoHref, detectiveTelHref, type CaseInfo } from "@/lib/case";

export function DetectiveActions({
  caseInfo,
  callLabel,
  emailLabel,
  size = "lg",
}: {
  caseInfo: CaseInfo;
  callLabel: string;
  emailLabel: string;
  size?: "default" | "lg";
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <ButtonLink
        href={detectiveTelHref(caseInfo)}
        variant="primary"
        size={size}
        onClick={() => trackEvent("detective_call_click")}
      >
        <Phone aria-hidden />
        {callLabel}
      </ButtonLink>
      <ButtonLink
        href={detectiveMailtoHref(caseInfo)}
        variant="outline"
        size={size}
        className="bg-white"
        onClick={() => trackEvent("detective_email_click")}
      >
        <Mail aria-hidden />
        {emailLabel}
      </ButtonLink>
    </div>
  );
}

export function StickyActionBar({
  caseInfo,
  callLabel,
  emailLabel,
}: {
  caseInfo: CaseInfo;
  callLabel: string;
  emailLabel: string;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-charcoal-200 bg-white/95 p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md gap-2">
        <ButtonLink
          href={detectiveTelHref(caseInfo)}
          variant="primary"
          className="flex-1"
          onClick={() => trackEvent("detective_call_click")}
        >
          <Phone aria-hidden />
          {callLabel}
        </ButtonLink>
        <ButtonLink
          href={detectiveMailtoHref(caseInfo)}
          variant="outline"
          className="flex-1"
          onClick={() => trackEvent("detective_email_click")}
        >
          <Mail aria-hidden />
          {emailLabel}
        </ButtonLink>
      </div>
    </div>
  );
}
