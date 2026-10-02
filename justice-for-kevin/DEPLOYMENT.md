# Deployment

## Vercel (web application)

1. Import the repository in Vercel; set **Root Directory** to
   `justice-for-kevin` (Framework: Next.js).
2. Configure environment variables (Production + Preview) from
   `.env.example`. `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`,
   `RESEND_API_KEY`, and `SENTRY_DSN` are **server-side only** — never prefix
   them with `NEXT_PUBLIC_`.
3. Set `NEXT_PUBLIC_SITE_URL` to the canonical production URL (used for QR
   codes, share links, and flyers).
4. Deploy. HSTS, CSP, and the other security headers are emitted by
   `next.config.ts` automatically in production.

## Supabase (database + storage)

1. Apply migrations: `supabase db push` (or run the SQL files in order in the
   SQL editor: `0001_schema.sql`, `0002_rls.sql`).
2. Run `supabase/seed.sql` once.
3. Verify buckets exist: `public-assets` (public) and `private-originals`
   (private, no policies → no client access; server signs URLs).
4. Configure Auth: site URL, redirect URLs, MFA for owner/administrator,
   rate limits on OTP endpoints (Authentication → Rate Limits) for
   brute-force protection.
5. Enable daily backups (see BACKUP_RESTORE.md) and PITR if available on the
   plan.

## Domain

- Point DNS at Vercel; enforce HTTPS (automatic).
- Update the `site_domain` setting in Admin → Settings.

## CI

`.github/workflows/justice-for-kevin-ci.yml` runs lint, typecheck, unit tests,
build, and Playwright e2e on every push/PR touching the app. Keep it green
before promoting to production.

## Post-deploy checklist

- [ ] `/` loads and shows case facts and detective contact.
- [ ] `/witness` shows potential-witness wording and the no-confrontation notice.
- [ ] `tel:` / `mailto:` actions work on a phone.
- [ ] Flyer PDF and report PDF generate client-side.
- [ ] `/admin` redirects to login when signed out; owner can sign in.
- [ ] RLS spot-check: anonymous API requests cannot read `leads`
      (`curl "$SUPABASE_URL/rest/v1/leads" -H "apikey: $ANON_KEY"` → empty/denied).
- [ ] Audit events appear for settings changes.
- [ ] Spanish toggle works.
