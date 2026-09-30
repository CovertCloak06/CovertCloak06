# AGENTS.md — AI Assistant Handoff & Project Context

> **Purpose of this file.** This repository is being migrated from relying on a
> hosted assistant (Claude) to a **local / open-weight coding model** driven by
> an agentic harness (OpenCode). This document is the handoff: it captures the
> project context a replacement model needs so it can continue development
> **without regressing behavior or architecture**.
>
> There was no `CLAUDE.md` in this repo, so this `AGENTS.md` is the first
> canonical AI-instruction file. It is written from the actual repository
> contents (READMEs, manifests, source, CI, security docs), not from
> assumptions. Any AI (OpenCode/Ollama/OpenRouter, Continue, Cursor, or a
> future Claude session) should read this first.
>
> Setup/runbook for the local model itself lives in
> [`docs/LOCAL_AI_SETUP.md`](docs/LOCAL_AI_SETUP.md).

Last updated: 2026-09-30

---

## 0. Prime directives for any AI working here

1. **Continuity over preference.** This is a mature codebase. Do **not** rewrite,
   reorganize, or "clean up" working code merely because you would have
   structured it differently. Preserve existing structure, naming, and idioms.
2. **Do not remove behavior you do not understand.** If something looks odd,
   inspect git history and surrounding code before changing it.
3. **Security features are load-bearing.** The `justice-for-kevin` app's
   guardrails (see §7) are the product, not decoration. Never weaken access
   control, auditing, integrity, or the fixed witness wording to "simplify."
4. **Never commit secrets.** No API keys, tokens, passwords, service-role keys,
   `.env` contents, or auth cookies in code, docs, or commit messages.
5. **This is not one project — it's two** unrelated sub-projects in a monorepo
   (see §2). Changes to one must not touch the other. CI for `justice-for-kevin`
   is path-scoped; keep it that way.
6. **Confirmation-gate destructive operations** (file deletion, DB reset, force
   push, dependency upgrades, `git` history rewrites). Prefer minimal diffs.

---

## 1. What this repository is

`CovertCloak06/CovertCloak06` is a **monorepo containing two independent
projects** plus shared tooling and a static landing site:

| Area | What it is | Status |
| --- | --- | --- |
| `justice-for-kevin/` | Next.js 15 + Supabase community information web app | **Active, mature** — main focus |
| `Chocobos_BP/`, `Chocobos_RP/` | Minecraft Bedrock add-on (behavior + resource packs) | Stable / dormant |
| `tools/` | Python asset generators + `.mcaddon` packager for the add-on | Supports the add-on |
| `site/` | Static landing page + downloadable pack artifacts (Netlify) | Deploy target for the add-on |
| `docs/` | Preview image + (now) this handoff's setup guide | — |

They share **nothing** at the code level. Treat them as separate.

---

## 2. Directory layout (top level)

```
.
├── AGENTS.md                     # this file
├── README.md                     # Chocobos add-on README (root README = the add-on)
├── netlify.toml                  # publishes site/ (the add-on landing page)
├── .github/workflows/
│   └── justice-for-kevin-ci.yml  # CI for the web app (path-scoped)
├── justice-for-kevin/            # ← the mature web application (see §3)
├── Chocobos_BP/                  # Minecraft behavior pack (server-side logic)
├── Chocobos_RP/                  # Minecraft resource pack (client-side visuals)
├── tools/                        # generate_assets.py, make_preview.py, build_mcaddon.sh
├── site/                         # index.html + .mcaddon/.mcpack downloads
└── docs/                         # preview.png, LOCAL_AI_SETUP.md
```

Note: the **root `README.md` documents the Minecraft add-on**; the web app has
its own `justice-for-kevin/README.md`. Don't confuse the two.

---

## 3. Project A — `justice-for-kevin/` (primary)

### 3.1 Purpose
A production, mobile-first **Community Information Hub** for the unsolved
homicide of Kevin Vandenbos (Antioch, CA — case **24-6070**, APD, Det. John
Cox). It is deliberately **not** a social network, suspect board, or vigilante
platform. Its functions:

1. Publish verified, administrator-approved case information.
2. Display law-enforcement-released witness material with the **fixed** wording
   *"a potential witness or person police are seeking to identify."*
3. Generate awareness materials (share kits, social graphics, print flyers, QR).
4. Help users format structured information for delivery to the assigned detective.
5. Track campaign outreach privately.
6. Maintain a private, role-gated lead-management workspace.
7. Preserve source provenance & file integrity (SHA-256, immutable originals).
8. Prevent unsupported allegations from being publicly displayed.

### 3.2 Stack
- **Frontend:** Next.js 15 (App Router, React Server Components), TypeScript
  **strict**, Tailwind CSS 4, shadcn-style UI components, Lucide icons, React
  Hook Form, Zod.
- **Backend:** Supabase (PostgreSQL, Auth, Storage). **Row-Level Security on
  every private table.** Sensitive writes go through Next.js **server actions**.
- **Documents:** pdf-lib (reports + flyers), qrcode.
- **Integrity:** SHA-256 via Web Crypto (client + server).
- **Abuse prevention:** Cloudflare Turnstile (boundary; no-op without keys).
- **Monitoring:** Sentry boundary with PII scrubbing.
- **Analytics:** Umami/Plausible hook — aggregate, privacy-conscious only.
- **Deploy:** Vercel + hosted Supabase.

### 3.3 Source map (`justice-for-kevin/src/`)
```
app/(public)/            # public site (RSC): case, timeline, witness, sources,
                         #   updates, share, flyers, submit-information, legal pages
app/admin/login/         # magic-link + password + TOTP (AAL2) login flow
app/admin/(dashboard)/   # role-gated workspace: leads, entities, sources,
                         #   campaigns, distribution, transmissions, files,
                         #   users, settings, audit (+ audit/export route)
components/site/         # header, footer, nav, share-kit, flyer-generator,
                         #   tip-form, turnstile, image-viewer, language-toggle
components/ui/           # badge, button, card, field (shadcn-style primitives)
lib/auth/                # roles.ts (RBAC), session.ts (requirePermission)
lib/supabase/            # browser.ts, server.ts, config.ts (client factories)
lib/data/                # public.ts (seed-fallback reads), qr.ts
lib/pdf/                 # report.ts, flyer.ts (pdf-lib generators)
lib/i18n/                # en.ts, es.ts, index.ts, server.ts (English + Spanish)
lib/                     # hash.ts, audit.ts, duplicates.ts, normalize.ts,
                         #   report.ts, share-templates.ts, rate-limit.ts,
                         #   tip-schema.ts, analytics.ts, case.ts, utils.ts
lib/integrations/        # monitoring.ts (Sentry), turnstile.ts, email.ts
middleware.ts            # session refresh / route protection
lib/__tests__/           # vitest units: auth-and-qr, duplicates, hash,
                         #   normalize, report
```
Supabase: `supabase/migrations/0001_schema.sql`, `0002_rls.sql`,
`0003_campaign_scan_rpc.sql`, and `supabase/seed.sql`. E2E: `e2e/public.spec.ts`
(Playwright).

### 3.4 How components interact
- Public pages are **RSC** that read approved content. With **no Supabase
  configured they render from seed-data fallbacks** (`lib/data/public.ts`) — this
  is intentional and is what CI/e2e rely on.
- The admin dashboard **requires Supabase**. Every sensitive action is a server
  action that calls `requirePermission(<permission>)` in `lib/auth/session.ts`,
  which resolves the caller's role **from the database**, never from the client.
- Authorization has three layers, in order of authority: **Postgres RLS →
  server-side checks → UI visibility (convenience only, never trusted).**
- Roles: `owner`, `administrator`, `reviewer`, `outreach`, `read_only`
  (`lib/auth/roles.ts`).

### 3.5 Build / test / run commands (run inside `justice-for-kevin/`)
```bash
npm install
cp .env.example .env.local     # fill values per SETUP.md; DO NOT commit
npm run dev                    # dev server
npm run build                  # production build
npm run lint                   # eslint (flat config)
npm run typecheck              # tsc --noEmit  (strict)
npm test                       # vitest unit tests
npm run test:e2e               # Playwright e2e (public.spec.ts)
npm run db:types               # regenerate Supabase TS types (local)
# Local Supabase:
supabase db reset              # applies migrations + seed  (DESTRUCTIVE: confirm)
```

### 3.6 CI (must stay green)
`.github/workflows/justice-for-kevin-ci.yml`, triggered on changes under
`justice-for-kevin/**`:
- **quality job:** `npm ci` → lint → typecheck → unit tests → build
- **e2e job:** installs Playwright chromium → `npm run test:e2e`

Nothing merges red. TypeScript is strict and lint is gating — a change that
doesn't `typecheck` or `lint` clean will fail CI.

---

## 4. Project B — Chocobos & Chickabos (Minecraft Bedrock add-on)

### 4.1 Purpose
A fan-made Bedrock Edition add-on adding rideable **Chocobos** and baby
**Chickabos** (six colour variants, taming, saddling, riding, breeding, flight
for black/gold, and a Gysahl Green crop). Requires Minecraft Bedrock **1.21+**;
uses the **stable** `@minecraft/server` Script API (no experimental toggles).

### 4.2 Layout
- `Chocobos_BP/` — behavior pack: `manifest.json`, `entities/chocobo.json`
  (health/AI/taming/riding/breeding/variants/fly flag), `items/`, `blocks/`,
  `scripts/main.js` (flight control + crop growth + harvest drops),
  `spawn_rules/`, `recipes/`, `texts/`.
- `Chocobos_RP/` — resource pack: models, textures (6 adult + 6 baby variants),
  animations, render/animation controllers, sounds, item/terrain texture maps.

### 4.3 CRITICAL convention — assets are generated, not hand-edited
Geometry and textures are emitted from a **single source of truth**:
```bash
pip install Pillow                 # one-time
python3 tools/generate_assets.py   # writes geometry + variant textures + icons
python3 tools/make_preview.py      # (optional) regenerates docs/preview.png
bash    tools/build_mcaddon.sh      # zips dist/*.mcpack and *.mcaddon
```
**Do not hand-edit generated geometry/texture files.** To change colours or
model shape, edit the palettes / bone-cube tables in `tools/generate_assets.py`
and re-run it — otherwise the UV maps and skins will drift apart. Variant
stats/abilities live in `Chocobos_BP/entities/chocobo.json`
(`cb:variant_*` component groups). Flight tuning constants (`FLY_SPEED`,
`HOVER_LIFT`, `DESCEND_SPEED`) are at the top of `scripts/main.js`.

`dist/` is git-ignored (build artifacts). `site/` holds the pre-built
downloadable packs and the Netlify landing page (`netlify.toml` → `publish = "site"`).

---

## 5. Coding conventions
- **TypeScript strict**, ESLint flat config (`eslint.config.mjs`) — both gate CI.
  Fix type/lint errors; don't suppress them without cause.
- Next.js **App Router + RSC**; sensitive writes are **server actions**, not
  client calls. Secret-only imports (e.g. `SUPABASE_SERVICE_ROLE_KEY`) live in
  `server-only` modules and must never be pulled into client bundles.
- Zod for input validation (`lib/tip-schema.ts` etc.).
- i18n via `lib/i18n/` (English + Spanish) — keep both locales in sync when
  adding user-facing strings.
- Minecraft JSON follows Bedrock schemas; the Script API is limited to
  long-stable `@minecraft/server` calls (so the pack loads on all 1.21+ builds).
- Match the density and style of surrounding comments; keep diffs minimal.

---

## 6. Current development state
- Latest work (git history): **PR #3 "Add Justice for Kevin community
  information platform"** merged 2026-07-30, including one round of automated
  review fixes. The web app is the active area of development.
- The Minecraft add-on last changed 2026-06-07 (Netlify hosting + downloadable
  artifacts + script-module compatibility). Stable/dormant.
- Working tree is clean; there are **no `TODO`/`FIXME`/`HACK` markers** in
  tracked source. (Absence of TODOs does not imply there is no remaining work —
  confirm priorities with the maintainer.)

### Known caveats (from the code/docs, not invented)
- **Flight is explicitly experimental** (README): script-driven, tuned by
  constants in `Chocobos_BP/scripts/main.js`, not play-tested on every Bedrock
  build. If a Bedrock version rejects the script module, the README documents
  bumping the `@minecraft/server` version in `Chocobos_BP/manifest.json`.
- Turnstile and Sentry are **no-ops without their keys** — expected in local dev.

---

## 7. Architectural constraints — DO NOT change casually

These are product guarantees for `justice-for-kevin`. Preserve them:

- The individual in released material is **always** described as a *potential
  witness*; only an authenticated administrator can change that wording (an
  audited settings change backed by an official statement).
- **Public users read only approved content** — enforced by Postgres **RLS**,
  not just UI.
- **Lead originals are immutable** at the DB/storage layer (`original_narrative`,
  attachment bytes). The `private-originals` storage bucket has **no** storage
  policies, so no client can touch file bytes.
- **Audit events are append-only for every role, including administrators**
  (enforced by RLS **and** a database trigger). Only the `owner` may export
  audit logs or delete attachments (soft-delete first).
- **No public comments, no auto-published submissions, no suspect labeling, no
  facial recognition, no guilt scoring.** Duplicate detection produces
  *suggestions only*; humans confirm.
- **"Sent" to APD is never displayed as "received."**
- MFA: once a user has an enrolled TOTP factor, the app **enforces AAL2**
  itself (`getAdminSession()` rejects aal1).

If a requested change would weaken any of the above, **stop and confirm with the
maintainer** before proceeding.

---

## 8. Security & safe-testing assumptions
- **Never expose secrets.** `SUPABASE_SERVICE_ROLE_KEY` is server-only. See
  `justice-for-kevin/.env.example` for the shape of required env (values are
  filled locally per `SETUP.md` and never committed).
- The security work in this repo is **defensive** (access control, integrity,
  auditing, incident response). Reference docs: `justice-for-kevin/SECURITY.md`,
  `PRIVACY.md`, `DATA_MODEL.md`, `INCIDENT_RESPONSE.md`, `BACKUP_RESTORE.md`,
  `ADMIN_GUIDE.md`, `DEPLOYMENT.md`, `SETUP.md`.
- **Safe to test without real data:** the public site renders from seed
  fallbacks with no Supabase; `supabase db reset` applies migrations + a seed
  that uses clearly-labeled placeholders (`needs_verification=true`) and
  **fabricates no official facts**. Use seed/placeholder data for testing —
  never real personal data.
- **Data-sensitivity rule for AI assistance:** the *code* is public (GitHub), so
  it is fine to send code to a hosted model. **Real lead data, DB contents,
  attachment bytes, or `.env` values must NOT be sent to any hosted API** — use
  the **local model** (Ollama) for anything that touches them. See
  `docs/LOCAL_AI_SETUP.md` §"When to use local vs. cloud".

---

## 9. Notes for the local model / harness
- The active project is JS/TS (Next.js). The harness needs to: read/search
  files, edit files, run `npm` scripts (`lint`, `typecheck`, `test`, `build`),
  inspect `git` diffs, and reason across multiple files under
  `justice-for-kevin/src`.
- Keep context focused on `justice-for-kevin/` for web work and on
  `Chocobos_*/` + `tools/` for add-on work — they don't overlap.
- Validate every change with the §3.5 commands before proposing it as done.
- Setup, model sizing, phone access, and the exact day-to-day command are in
  [`docs/LOCAL_AI_SETUP.md`](docs/LOCAL_AI_SETUP.md).
