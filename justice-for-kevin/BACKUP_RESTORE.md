# Backup & Restore

## What must be backed up

1. **Postgres database** — all case content, leads, entities, audit trail.
2. **Storage buckets** — `private-originals` (evidentiary; critical) and
   `public-assets`.
3. **Configuration** — env vars (Vercel + Supabase), Auth settings.

## Database

- Hosted Supabase: enable **daily automated backups**; enable PITR if the
  plan allows. Verify in Project Settings → Database → Backups.
- Manual snapshot (also good before risky changes):

```bash
supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-$(date +%F).sql
```

- Restore:

```bash
psql "$SUPABASE_DB_URL" -f backup-YYYY-MM-DD.sql
```

For a clean environment, apply `supabase/migrations/*` first, then restore
data only, then re-run `select setval('public.lead_human_id_seq', (select max(substring(human_id from 3)::bigint) from public.leads));`
so new lead IDs don't collide.

## Storage

Mirror buckets to an off-site location on a schedule (cron/CI job):

```bash
# using rclone with an S3-compatible remote configured for Supabase storage
rclone sync supabase:private-originals encrypted-offsite:jfk-private-originals
rclone sync supabase:public-assets offsite:jfk-public-assets
```

The off-site copy of `private-originals` must be encrypted at rest and
access-restricted to the owner. After any restore, verify integrity by
recomputing SHA-256 of each object and comparing to `attachments.sha256`.

## Restore drill (quarterly)

1. Create a scratch Supabase project.
2. Apply migrations, restore the latest dump, sync a sample of storage.
3. Point a preview deployment at it and verify: login, a lead detail page,
   a signed-URL download, hash match on one attachment.
4. Record the drill date and outcome in the ops log.

## Retention

Keep at least 30 daily database backups and 12 monthly archives. Because
lead data may have evidentiary value, do not prune backups that cover an
active investigation window without owner sign-off.
