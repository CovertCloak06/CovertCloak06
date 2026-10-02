# Privacy Design

The public privacy policy lives at `/privacy` (English and Spanish). This
document describes the engineering decisions behind it.

## Principles

- **Default no-storage.** The tip form formats a report the user delivers
  themselves. Nothing is persisted unless an administrator enables secure
  intake — and that switch is audited.
- **Nothing public without approval.** Submissions never auto-publish. Public
  tables expose only `approved=true` rows via RLS.
- **No accusations.** The person in released material is described only as a
  potential witness. No suspect labels, no guilt scores, no ML criminality
  inference, no facial recognition or resemblance matching anywhere in the
  codebase.
- **Data minimization.**
  - Analytics: aggregate, no cross-site tracking, no fingerprinting, no
    visitor IPs exposed to administrators.
  - QR scans: campaign slug + coarse referrer host + date only; no GPS.
  - Audit: salted IP hashes only.
- **Anonymous submissions** are supported and flagged; the UI explains they
  are harder to verify.
- **Metadata:** originals keep their metadata privately (evidentiary value);
  public derivatives are stripped; GPS EXIF is never exposed publicly.
- **No sale of data, no advertising trackers, no public user profiles.**

## Sensitive data inventory

| Data | Where | Access |
| --- | --- | --- |
| Submitter identity | `leads.submitter_*` | owner/administrator/reviewer (RLS); anonymous identities are never collected |
| Original narratives | `leads.original_narrative` (immutable) | same as above |
| Attachment originals | `private-originals` bucket | server-signed 120 s URLs only; every signing audited |
| Internal notes | `lead_notes` (sensitive flag) | lead-management roles |
| Outreach contacts | `distribution_targets` | staff only; never rendered publicly |
| Audit trail | `audit_events` | owner/administrator read; nobody edits |

## Retention & deletion

- Leads use status (`closed`, `retain`) rather than deletion; `deleted_at`
  soft-delete exists for exceptional cases.
- Attachments: soft-delete first (`soft_deleted_at` + reason); physical
  deletion is owner-only and should follow law-enforcement guidance, since
  files may have evidentiary value.
- If a data subject requests removal of their contact details, an
  administrator can null the submitter fields; the immutable narrative and
  audit trail are preserved (documented in ADMIN_GUIDE.md).
