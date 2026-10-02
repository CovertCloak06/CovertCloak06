"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAttachmentSignedUrl } from "../actions";

/** Opens a short-lived signed URL for a private original. Each request is
 * audited server-side. */
export function AttachmentDownload({ attachmentId }: { attachmentId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="shrink-0 text-right">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const result = await getAttachmentSignedUrl(attachmentId);
            if (result.ok && result.url) {
              window.open(result.url, "_blank", "noopener");
            } else {
              setError(result.error ?? "Failed");
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Download aria-hidden />}
        Signed URL
      </Button>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-urgent-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
