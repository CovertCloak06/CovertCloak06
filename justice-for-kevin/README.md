# Justice for Kevin

**Community Information Hub for the Kevin Vandenbos Homicide Investigation**

A production-ready, mobile-first web application supporting an ongoing community
awareness campaign related to the unsolved homicide of Kevin Vandenbos
(Antioch, CA — case **24-6070**, Antioch Police Department, Detective John Cox).

This is **not** a social network, crowdsourced suspect board, or vigilante
investigation platform. Its functions are:

1. Publish verified, administrator-approved case information.
2. Display law-enforcement-released witness material with the fixed wording
   *"a potential witness or person police are seeking to identify."*
3. Generate awareness materials (share kits, social graphics, print flyers, QR codes).
4. Help users format structured information for direct delivery to the assigned detective.
5. Track campaign outreach privately.
6. Maintain a private, role-gated lead-management workspace.
7. Preserve source provenance and file integrity (SHA-256, immutable originals).
8. Prevent unsupported allegations from being publicly displayed (no public
   comments, no auto-published submissions, no suspect labeling, no facial
   recognition, no guilt scoring).

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router, RSC), TypeScript strict, Tailwind CSS 4, shadcn-style components, Lucide, React Hook Form, Zod |
| Backend | Supabase (PostgreSQL, Auth, Storage), Row-Level Security on every private table, server actions for sensitive writes |
| Documents | pdf-lib (reports + flyers), qrcode |
| Integrity | SHA-256 via Web Crypto (client + server) |
| Abuse prevention | Cloudflare Turnstile (boundary; no-op without keys) |
| Monitoring | Sentry boundary with PII scrubbing (`src/lib/integrations/monitoring.ts`) |
| Analytics | Umami/Plausible script hook — aggregate, privacy-conscious only |
| CI | GitHub Actions (`.github/workflows/justice-for-kevin-ci.yml`): lint, typecheck, unit tests, build, Playwright e2e |
| Deploy | Vercel + hosted Supabase |

## Local setup

```bash
cd justice-for-kevin
npm install
cp .env.example .env.local   # fill values (see SETUP.md)
npm run dev
```

The public site renders with seed-data fallbacks even with **no** Supabase
configured; the admin dashboard requires Supabase. Full instructions,
including local Supabase (`supabase start`), migrations, seeding, and
bootstrapping the owner account: **[SETUP.md](./SETUP.md)**.

## Environment variables

See [`.env.example`](./.env.example). Never expose `SUPABASE_SERVICE_ROLE_KEY`
to the browser — it is imported only in `server-only` modules.

## Database

- Migrations: `supabase/migrations/0001_schema.sql` (tables, indexes,
  triggers, buckets) and `0002_rls.sql` (RLS policies).
- Seed: `supabase/seed.sql` — case record, detective contact, clearly-labeled
  placeholder sources/timeline entries (`needs_verification=true`), default
  settings and share templates. **No official facts are fabricated.**

```bash
supabase db reset        # applies migrations + seed locally
```

## Commands

```bash
npm run dev         # dev server
npm run build       # production build
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # vitest unit tests
npm run test:e2e    # Playwright end-to-end tests
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md). Additional docs: [SECURITY.md](./SECURITY.md),
[PRIVACY.md](./PRIVACY.md), [DATA_MODEL.md](./DATA_MODEL.md),
[ADMIN_GUIDE.md](./ADMIN_GUIDE.md), [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md),
[BACKUP_RESTORE.md](./BACKUP_RESTORE.md).

## Guardrails baked into the product

- The individual in released material is always described as a potential
  witness; only an authenticated administrator can change that wording (an
  audited settings change backed by an official statement).
- Public users can only read approved content (enforced by RLS, not just UI).
- Lead originals (`original_narrative`, attachment bytes) are immutable at the
  database/storage layer.
- Audit events are append-only for every role, including administrators.
- Duplicate detection produces suggestions only; humans confirm.
- "Sent" to APD is never displayed as "received."
