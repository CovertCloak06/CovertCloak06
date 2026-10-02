# Incident Response

## Severity levels

| Level | Example | Response |
| --- | --- | --- |
| SEV-1 | Private lead/attachment data exposed; account takeover | Immediate containment, notify owner + affected parties, consider notifying Detective Cox if evidence integrity is implicated |
| SEV-2 | Defacement, unsupported allegation published, auth bypass suspected | Same-day containment and correction |
| SEV-3 | Abuse of the tip form, spam floods, availability issues | Rate-limit/tune, monitor |

## Immediate containment steps

1. **Maintenance mode:** Admin → Settings → `maintenance_mode=true` (audited),
   or pause the Vercel deployment.
2. **Revoke credentials:** rotate the Supabase service-role key and anon key
   (Project Settings → API), rotate any Resend/Turnstile/Sentry keys, then
   redeploy with new env vars.
3. **Freeze sessions:** in Supabase Auth, sign out all users
   (Authentication → Users → sign out) and require re-login; disable
   password auth temporarily if credentials may be compromised.
4. **Suspend a compromised admin:** delete their row from `user_roles`
   (removes all data access instantly via RLS) and disable the auth user.

## Investigation

- `audit_events` is append-only and cannot have been edited by any role —
  use it as the primary forensic timeline (actor, action, entity,
  before/after state, salted IP hash, request id).
- Supabase logs (API + Auth) and Vercel logs cover the transport layer.
- Attachment integrity: recompute SHA-256 of stored originals and compare to
  `attachments.sha256` and `transmission_attachments.sha256_at_transmission`.

## If published content was wrong

1. Unapprove the content (source/update/timeline entry) immediately.
2. Publish a correction with `correction_note` / `corrected_at` rather than
   silently editing history.
3. If a person was identifiable, document the exposure window and inform the
   owner; consider direct outreach and, where relevant, Detective Cox.

## If evidence integrity is in question

Do not delete anything. Preserve the bucket state, export the audit trail
(owner), and contact Detective Cox (925-481-8147, jcox@antiochca.gov) before
any remediation that touches lead data or attachments.

## Post-incident

Write a short timeline (detection → containment → root cause → fixes),
file remediation tasks, and update this document with lessons learned.
