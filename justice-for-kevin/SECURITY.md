# Security

## Authorization model

Three enforcement layers, in order of authority:

1. **Postgres RLS** (`supabase/migrations/0002_rls.sql`) — every private table
   has RLS enabled; anonymous users can read only approved public content;
   role access derives from `public.user_roles` via `security definer`
   helpers. The `private-originals` bucket has **no** storage policies, so no
   client (anon or authenticated) can touch file bytes.
2. **Server-side checks** — every server action calls
   `requirePermission(<permission>)` (`src/lib/auth/session.ts`), which
   resolves the caller's role from the database, not from the client.
3. **UI visibility** — convenience only; never trusted.

Roles: `owner`, `administrator`, `reviewer`, `outreach`, `read_only`
(`src/lib/auth/roles.ts`). Notable restrictions: only the owner may export
audit logs or delete attachments (soft-delete first); administrators cannot
modify audit history (append-only via RLS **and** a database trigger).

## Authentication

- Supabase Auth: passwordless magic links by default, password fallback.
- MFA (TOTP): enable enrollment in the Supabase dashboard (Authentication →
  MFA). Once a user has an enrolled factor, the app enforces AAL2 itself:
  `getAdminSession()` rejects aal1 sessions, and the login page runs the
  TOTP challenge (`src/app/admin/login/login-form.tsx`) before any dashboard
  access. Owner/administrator accounts should enroll a factor immediately.
- Sessions are JWT-based with rotation on refresh; middleware
  (`src/middleware.ts`) refreshes tokens and gates `/admin`.
- Cookies: httpOnly, SameSite=Lax, Secure in production.
- Brute-force protection: Supabase Auth rate limits + the app-level fixed
  window limiter (`src/lib/rate-limit.ts`) on public submission.

## Headers & transport

`next.config.ts` emits on every response:

- `Content-Security-Policy` (self + Turnstile only; no third-party scripts
  beyond the optional analytics origin)
- `Strict-Transport-Security` (production)
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
  (camera/mic/geolocation denied)

CSRF: all state-changing operations are Next.js server actions (same-origin
enforced by the framework; `form-action 'self'` in CSP) — no cookie-authenticated
GET mutations exist.

## Input & file handling

- All inputs validated with Zod on the server (client validation is UX only).
- File uploads: extension **and** MIME allowlist, 100 MB default ceiling
  (server-enforced; lower it per deploy with `NEXT_PUBLIC_MAX_UPLOAD_MB` on
  hosts whose function body limit is smaller — e.g. Netlify's 6 MB
  synchronous payload cap), SHA-256 of the
  exact original bytes, originals stored with `upsert: false` (never
  overwritten) in the private bucket, previews generated separately.
- `virus_scan_status` on every attachment is the integration point for a
  scanner; files stay `pending` until scanned (wire ClamAV or a storage
  webhook — see SETUP.md).
- Signed URLs: 120-second expiry, generated server-side with the service
  role, each generation audited.

## Rate limiting

Public secure intake: 5 submissions/hour/IP (fixed window, in-memory). For
multi-region/serverless scale, replace `src/lib/rate-limit.ts` internals with
a durable store (Upstash Redis or a Postgres counter); the interface is
designed for that swap. Turnstile provides the bot-resistance layer in front.

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY` is only imported in `server-only` modules;
  bundling it client-side is a build error.
- No secrets in the client bundle; `NEXT_PUBLIC_*` vars are public by design.

## Monitoring & logging hygiene

- `captureError` scrubs PII keys (names, phones, emails, narratives) before
  anything reaches Sentry or logs.
- Raw submission bodies are never sent to analytics or error reporting.
- Audit `ip_hash` stores a salted SHA-256, never the raw IP.

## Reporting a vulnerability

Email the campaign administrator (see site footer contact) with details.
Do not open public issues for security reports. Coordinated disclosure is
appreciated; there is no bug bounty.
