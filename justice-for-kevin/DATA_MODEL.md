# Data Model

All tables use UUID primary keys and carry `created_at` / `updated_at`
(maintained by trigger) and `created_by` where applicable. Migrations:
`supabase/migrations/0001_schema.sql` (structure) and `0002_rls.sql` (RLS).

## Core case content (public-readable when approved)

| Table | Purpose | Notes |
| --- | --- | --- |
| `cases` | Case record | one `is_primary=true` row; seeds the whole site |
| `case_contacts` | Detective/agency contacts | `is_public` flag |
| `sources` | Provenance archive | `approved`, `verification_status`, `needs_verification`, `last_reviewed_at`, `correction_note` |
| `source_snapshots` | Archived screenshots | `legally_permitted` flag |
| `official_updates` | Facts (`kind='fact'`) + updates (`kind='update'`) | `verification_type` drives source badges |
| `timeline_entries` | Verified timeline | correction fields (`corrected_at`, `correction_note`) |
| `public_assets` | Approved images/flyers | `kind='witness_image'` powers the witness page |
| `site_settings` | Key/value config | `public` rows readable by anyone |
| `translations` | DB-backed translation overrides | static dictionaries in `src/lib/i18n` are the baseline |

## Lead workspace (never public)

| Table | Purpose | Notes |
| --- | --- | --- |
| `leads` | Tips/leads | `human_id` (`L-000001`) via trigger; `original_narrative` and `received_at` immutable via trigger; generated `search` tsvector; trigram index on narrative; normalized phone/email columns |
| `lead_notes` | Internal notes | `sensitive` flag |
| `lead_status_history` | Status audit trail | append per transition |
| `lead_duplicate_suggestions` | Conservative duplicate hints | `status: suggested/confirmed/rejected` — human decision required; originals never merged/deleted |
| `attachments` | File metadata | storage identity + SHA-256 immutable via trigger; `soft_deleted_at` before physical delete; `virus_scan_status` |

## Entity graph (never public — `public_visibility` is CHECK-constrained to false)

| Table | Purpose |
| --- | --- |
| `entities` | Typed index (person, nickname, vehicle, location, business, organization, phone, email, username, social_account, document, image, video, other) with `normalized_value` |
| `lead_entities` | Lead ↔ entity links with relationship + confidence (`stated/probable/uncertain/machine_suggested`) |
| `entity_relationships` | Entity ↔ entity edges (constrained relationship list) with source lead, confidence, `independently_corroborated`, and `machine_generated` flag |

## Outreach

| Table | Purpose |
| --- | --- |
| `distribution_targets` | Outreach locations/groups: type, geography, contact, status pipeline, metrics, follow-ups |
| `campaigns` | QR campaign slugs with aggregate scan stats |
| `campaign_actions` | Action log per campaign/target |
| `qr_scans` | Aggregate scan rows (slug, referrer host, date) |

## Law-enforcement handoff

| Table | Purpose |
| --- | --- |
| `transmissions` | Packets sent to APD; `delivery_status` pipeline (draft → … → acknowledged); "sent" ≠ "received" |
| `transmission_leads` | Leads included (FK `on delete restrict` — leads referenced by a transmission cannot be deleted) |
| `transmission_attachments` | Attachment manifest with `sha256_at_transmission` snapshot |

## Accounts & audit

| Table | Purpose |
| --- | --- |
| `users` | Profile mirror of `auth.users` |
| `user_roles` | One role per user (owner/administrator/reviewer/outreach/read_only) |
| `audit_events` | Append-only (RLS + trigger). Actor, action, entity, before/after JSONB, reason, request id, salted IP hash |

## Key indexes

Case number; lead status/created/search (GIN tsvector)/narrative trigram/phone/email;
entity normalized value + display-name trigram; attachment SHA-256;
distribution status + geography; transmission status; audit created/entity.

Extensions: `pgcrypto` (UUIDs), `pg_trgm` (similarity).
