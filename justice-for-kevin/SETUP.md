# Setup

## Prerequisites

- Node.js 22+
- npm 10+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local database / migrations)

## 1. Install

```bash
cd justice-for-kevin
npm install
cp .env.example .env.local
```

## 2. Supabase project

### Hosted

1. Create a project at supabase.com.
2. In **Project Settings → API**, copy the project URL and anon key into
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the
   service-role key into `SUPABASE_SERVICE_ROLE_KEY` (server-only).
3. Apply migrations and seed:

```bash
supabase link --project-ref <ref>
supabase db push          # applies supabase/migrations/*
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # or run in the SQL editor
```

### Local

```bash
supabase start
supabase db reset         # migrations + seed.sql
```

`supabase status` prints the local URL/keys for `.env.local`.

## 3. Bootstrapping the owner account

Roles live in `public.user_roles`; the first grant must be manual:

1. Start the app, open `/admin/login`, and sign in once with a magic link
   (this creates the `auth.users` row).
2. In the SQL editor:

```sql
insert into public.users (id, email)
select id, email from auth.users where email = 'you@example.org'
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select id, 'owner' from auth.users where email = 'you@example.org';
```

3. Reload `/admin` — you now have full access and can assign further roles
   from **Admin → Users**.

## 4. Auth hardening (Supabase dashboard)

- Enable email OTP/magic link (default) and set a strong password policy if
  password auth is allowed.
- **Enable MFA (TOTP)** and require enrollment for owner/administrator
  accounts (Authentication → MFA).
- Set Site URL and redirect URLs to your domain (magic-link redirects).
- Keep JWT expiry short (default 1h) — sessions rotate on refresh.

## 5. Enabling optional integrations

Each integration is a mocked boundary until its credential exists:

| Integration | Enable by | Code boundary |
| --- | --- | --- |
| Cloudflare Turnstile | Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | `src/lib/integrations/turnstile.ts` (skips + logs when unset) |
| Resend email | Set `RESEND_API_KEY` (+ `ADMIN_NOTIFICATION_EMAIL`), verify sending domain | `src/lib/integrations/email.ts` (mock-logs when unset) |
| Sentry | Set `SENTRY_DSN`, `npm i @sentry/nextjs`, run `npx @sentry/wizard@latest -i nextjs`, then replace the console call in `captureError` with `Sentry.captureException` | `src/lib/integrations/monitoring.ts` (PII scrubbing stays in place) |
| Umami/Plausible | Set `NEXT_PUBLIC_ANALYTICS_URL` + `NEXT_PUBLIC_ANALYTICS_SITE_ID` | script injected in `src/app/layout.tsx`; events via `src/lib/analytics.ts` |
| Virus scanning | Wire a scanner (e.g. ClamAV worker or storage-scan webhook) to update `attachments.virus_scan_status` | column + `pending` default already exist |

## 6. Secure intake

By default the tip form stores nothing — users deliver reports directly
(email/PDF/call). To enable stored submissions:

1. Admin → Settings → set `secure_intake_enabled` to `true` (audited).
2. Confirm Turnstile keys are set in production.
3. Submissions then create leads + private attachments and return a lead
   reference number (`L-000123`).

## 7. Run checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e   # requires the dev server (started automatically)
```
