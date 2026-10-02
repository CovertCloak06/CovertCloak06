import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatBytes } from "@/lib/utils";
import { AttachmentDownload } from "../leads/[id]/attachment-download";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const [session, supabase] = await Promise.all([
    getAdminSession(),
    createSupabaseServerClient(),
  ]);
  if (!session || !supabase) return null;

  const { data: attachments } = await supabase
    .from("attachments")
    .select("id, lead_id, original_filename, mime_type, size_bytes, sha256, uploaded_at, virus_scan_status, soft_deleted_at, storage_bucket")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Files</h1>
      <p className="mt-1 text-sm text-charcoal-600">
        Private originals live in the <code>private-originals</code> bucket, are
        SHA-256 hashed, never overwritten, and only reachable through audited,
        short-lived signed URLs. Deletion is restricted to the owner role and is
        soft-delete first.
      </p>

      <div className="mt-5 overflow-x-auto rounded-lg border border-charcoal-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-charcoal-200 bg-charcoal-50 text-left">
            <tr>
              <th scope="col" className="p-3 font-semibold">Filename</th>
              <th scope="col" className="p-3 font-semibold">Lead</th>
              <th scope="col" className="p-3 font-semibold">Size</th>
              <th scope="col" className="p-3 font-semibold">SHA-256</th>
              <th scope="col" className="p-3 font-semibold">Scan</th>
              <th scope="col" className="p-3 font-semibold">Uploaded</th>
              <th scope="col" className="p-3 font-semibold">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {(attachments ?? []).map((attachment) => (
              <tr key={attachment.id} className={attachment.soft_deleted_at ? "opacity-50" : ""}>
                <td className="max-w-56 truncate p-3">{attachment.original_filename}</td>
                <td className="p-3">
                  {attachment.lead_id ? (
                    <Link
                      href={`/admin/leads/${attachment.lead_id}`}
                      className="text-steel-700 underline-offset-2 hover:underline"
                    >
                      view lead
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap p-3 tabular-nums">{formatBytes(attachment.size_bytes)}</td>
                <td className="p-3 font-mono text-xs">{attachment.sha256.slice(0, 16)}…</td>
                <td className="p-3">
                  <Badge variant={attachment.virus_scan_status === "flagged" ? "warning" : "neutral"}>
                    {attachment.virus_scan_status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap p-3 tabular-nums text-charcoal-500">
                  {new Date(attachment.uploaded_at).toLocaleString()}
                </td>
                <td className="p-3">
                  {attachment.soft_deleted_at ? (
                    <span className="text-xs text-charcoal-500">soft-deleted</span>
                  ) : (
                    <AttachmentDownload attachmentId={attachment.id} />
                  )}
                </td>
              </tr>
            ))}
            {(attachments ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-charcoal-500">
                  No attachments.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
