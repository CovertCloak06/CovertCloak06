-- ============================================================================
-- Unbroken: The Fight for Kevin — schema migration
-- All primary keys are UUIDs; every table carries created_at/updated_at and
-- created_by where applicable. RLS policies live in 0002_rls.sql.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Users & roles
-- ---------------------------------------------------------------------------

-- Profile rows mirror auth.users (Supabase Auth owns credentials/MFA).
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('owner','administrator','reviewer','outreach','read_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  unique (user_id)
);

-- Role lookup used throughout RLS. SECURITY DEFINER so policies can read
-- user_roles without recursive RLS evaluation.
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

create or replace function public.has_any_role(roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = any (roles), false);
$$;

-- ---------------------------------------------------------------------------
-- Case core
-- ---------------------------------------------------------------------------

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  is_primary boolean not null default false,
  victim_name text not null,
  victim_age integer,
  incident_date date not null,
  incident_location text not null,
  investigating_agency text not null,
  investigator_name text not null,
  investigator_badge text,
  investigator_phone text,
  investigator_email text,
  case_number text not null,
  case_status text not null default 'Open / Active',
  public_objective text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create unique index cases_one_primary on public.cases (is_primary) where is_primary;
create index cases_case_number_idx on public.cases (case_number);

create table public.case_contacts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  name text not null,
  agency text,
  badge text,
  phone text,
  email text,
  role text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index case_contacts_case_idx on public.case_contacts (case_id);

-- ---------------------------------------------------------------------------
-- Public content: sources, updates, timeline, assets, settings, translations
-- ---------------------------------------------------------------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases (id) on delete set null,
  title text not null,
  publisher text not null default '',
  source_type text not null check (source_type in ('law_enforcement','official_record','media','campaign','other')),
  original_url text,
  publication_date date,
  accessed_date date,
  summary text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','partially_verified','verified','disproved')),
  approved boolean not null default false,
  needs_verification boolean not null default true,
  last_reviewed_at timestamptz,
  correction_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index sources_approved_idx on public.sources (approved) where approved;
create index sources_publication_idx on public.sources (publication_date desc);

create table public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,
  storage_path text not null,
  sha256 text,
  captured_at timestamptz not null default now(),
  legally_permitted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index source_snapshots_source_idx on public.source_snapshots (source_id);

create table public.official_updates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases (id) on delete cascade,
  kind text not null default 'update' check (kind in ('update','fact')),
  title text,
  body text not null,
  verification_type text not null
    check (verification_type in ('law_enforcement','official_record','media','campaign')),
  source_id uuid references public.sources (id),
  source_date date not null default current_date,
  published_at timestamptz not null default now(),
  approved boolean not null default false,
  needs_verification boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index official_updates_approved_idx on public.official_updates (approved, kind, published_at desc);

create table public.timeline_entries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases (id) on delete cascade,
  event_date date not null,
  publication_date date,
  title text not null,
  summary text not null,
  verification_type text not null
    check (verification_type in ('law_enforcement','official_record','media','campaign')),
  source_id uuid references public.sources (id),
  approved boolean not null default false,
  needs_verification boolean not null default false,
  corrected_at timestamptz,
  correction_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index timeline_entries_approved_idx on public.timeline_entries (approved, event_date);

create table public.public_assets (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases (id) on delete cascade,
  kind text not null check (kind in ('witness_image','flyer','graphic','document','other')),
  title text,
  description text,
  public_url text not null,
  storage_path text,
  sha256 text,
  released_on date,
  agency_source text,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index public_assets_kind_idx on public.public_assets (kind, approved, created_at desc);

create table public.site_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text,
  public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create table public.translations (
  id uuid primary key default gen_random_uuid(),
  locale text not null check (locale in ('en','es')),
  namespace text not null default 'public',
  key text not null,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  unique (locale, namespace, key)
);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

create sequence public.lead_human_id_seq;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  human_id text not null unique,
  case_id uuid not null references public.cases (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  received_at timestamptz not null default now(),
  intake_channel text not null default 'web'
    check (intake_channel in ('web','email','phone','social','in_person','law_enforcement','other')),
  source_classification text not null
    check (source_classification in ('firsthand','recognition','secondhand','online','speculation')),
  status text not null default 'unreviewed'
    check (status in ('unreviewed','needs_follow_up','insufficient_detail','submitted_to_apd',
                      'corroborated','duplicate','closed','retain')),
  priority text not null default 'unassigned'
    check (priority in ('unassigned','routine','important','urgent')),
  title text not null,
  summary text not null default '',
  original_narrative text not null,
  normalized_narrative text not null default '',
  submitter_name text,
  submitter_phone text,
  submitter_phone_normalized text,
  submitter_email text,
  submitter_email_normalized text,
  anonymous boolean not null default false,
  sensitive boolean not null default false,
  apd_submitted_at timestamptz,
  apd_reference text,
  assigned_user_id uuid references public.users (id),
  tags text[] not null default '{}',
  deleted_at timestamptz,
  search tsvector generated always as (
    to_tsvector('english',
      coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' ||
      coalesce(normalized_narrative,'') || ' ' || coalesce(original_narrative,''))
  ) stored
);

create index leads_status_idx on public.leads (status);
create index leads_case_idx on public.leads (case_id);
create index leads_created_idx on public.leads (created_at desc);
create index leads_search_idx on public.leads using gin (search);
create index leads_narrative_trgm_idx on public.leads using gin (normalized_narrative gin_trgm_ops);
create index leads_phone_idx on public.leads (submitter_phone_normalized) where submitter_phone_normalized is not null;
create index leads_email_idx on public.leads (submitter_email_normalized) where submitter_email_normalized is not null;

-- Human-readable lead IDs: L-000001, L-000002, …
create or replace function public.assign_lead_human_id()
returns trigger language plpgsql as $$
begin
  if new.human_id is null or new.human_id = '' then
    new.human_id := 'L-' || lpad(nextval('public.lead_human_id_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger leads_human_id before insert on public.leads
  for each row execute function public.assign_lead_human_id();

-- The original submission must never be overwritten.
create or replace function public.protect_original_narrative()
returns trigger language plpgsql as $$
begin
  if new.original_narrative is distinct from old.original_narrative then
    raise exception 'original_narrative is immutable';
  end if;
  if new.received_at is distinct from old.received_at then
    raise exception 'received_at is immutable';
  end if;
  return new;
end;
$$;

create trigger leads_protect_original before update on public.leads
  for each row execute function public.protect_original_narrative();

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  body text not null,
  sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index lead_notes_lead_idx on public.lead_notes (lead_id, created_at desc);

create table public.lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index lead_status_history_lead_idx on public.lead_status_history (lead_id, created_at desc);

create table public.lead_duplicate_suggestions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  candidate_lead_id uuid not null references public.leads (id) on delete cascade,
  score numeric(4,3) not null,
  reasons text[] not null default '{}',
  status text not null default 'suggested' check (status in ('suggested','confirmed','rejected')),
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, candidate_lead_id)
);

-- ---------------------------------------------------------------------------
-- Attachments (private originals; previews are separate derivatives)
-- ---------------------------------------------------------------------------

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id) on delete set null,
  storage_bucket text not null default 'private-originals',
  storage_path text not null,
  preview_path text,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  uploaded_at timestamptz not null default now(),
  exif_stripped_preview boolean not null default true,
  virus_scan_status text not null default 'pending'
    check (virus_scan_status in ('pending','clean','flagged','unscanned')),
  soft_deleted_at timestamptz,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index attachments_lead_idx on public.attachments (lead_id);
create index attachments_sha256_idx on public.attachments (sha256);

-- Originals must never be overwritten: forbid changing storage identity.
create or replace function public.protect_attachment_original()
returns trigger language plpgsql as $$
begin
  if new.storage_path is distinct from old.storage_path
     or new.sha256 is distinct from old.sha256
     or new.storage_bucket is distinct from old.storage_bucket
     or new.original_filename is distinct from old.original_filename
     or new.size_bytes is distinct from old.size_bytes then
    raise exception 'attachment original identity is immutable';
  end if;
  return new;
end;
$$;

create trigger attachments_protect_original before update on public.attachments
  for each row execute function public.protect_attachment_original();

-- ---------------------------------------------------------------------------
-- Entities
-- ---------------------------------------------------------------------------

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('person','nickname','vehicle','location','business','organization',
    'phone','email','username','social_account','document','image','video','other')),
  display_name text not null,
  normalized_value text,
  description text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','partially_verified','verified','disproved')),
  public_visibility boolean not null default false check (public_visibility = false),
  sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index entities_type_idx on public.entities (type);
create index entities_normalized_idx on public.entities (normalized_value);
create index entities_name_trgm_idx on public.entities using gin (display_name gin_trgm_ops);

create table public.lead_entities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  entity_id uuid not null references public.entities (id) on delete cascade,
  relationship text not null default 'mentioned_in',
  confidence text not null default 'stated' check (confidence in ('stated','probable','uncertain','machine_suggested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  unique (lead_id, entity_id, relationship)
);

create index lead_entities_lead_idx on public.lead_entities (lead_id);
create index lead_entities_entity_idx on public.lead_entities (entity_id);

create table public.entity_relationships (
  id uuid primary key default gen_random_uuid(),
  from_entity_id uuid not null references public.entities (id) on delete cascade,
  to_entity_id uuid not null references public.entities (id) on delete cascade,
  relationship text not null check (relationship in ('mentioned_in','associated_with','observed_at','owns',
    'operates','uses','works_at','seen_with','possibly_same_as','duplicate_of')),
  source_lead_id uuid references public.leads (id) on delete set null,
  confidence text not null default 'stated' check (confidence in ('stated','probable','uncertain','machine_suggested')),
  independently_corroborated boolean not null default false,
  machine_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index entity_relationships_from_idx on public.entity_relationships (from_entity_id);
create index entity_relationships_to_idx on public.entity_relationships (to_entity_id);

-- ---------------------------------------------------------------------------
-- Campaign distribution
-- ---------------------------------------------------------------------------

create table public.distribution_targets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_type text not null check (target_type in ('facebook_group','nextdoor_neighborhood','local_business',
    'apartment_complex','church','community_organization','news_outlet','school','bar_restaurant',
    'transit_location','shelter','union','veterans_organization','other')),
  city text,
  neighborhood text,
  platform text,
  contact_person text,
  contact_info text,
  url text,
  audience_size integer,
  priority text not null default 'routine' check (priority in ('routine','important','urgent')),
  status text not null default 'not_contacted'
    check (status in ('not_contacted','contacted','awaiting_response','approved','posted',
                      'declined','follow_up','complete')),
  last_contacted date,
  next_follow_up date,
  accepted_flyer boolean,
  published_post_url text,
  estimated_views integer,
  shares integer,
  comments integer,
  possible_lead_generated boolean not null default false,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index distribution_targets_status_idx on public.distribution_targets (status);
create index distribution_targets_city_idx on public.distribution_targets (city, neighborhood);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  distribution_target_id uuid references public.distribution_targets (id) on delete set null,
  first_scan_at timestamptz,
  last_scan_at timestamptz,
  scan_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index campaigns_slug_idx on public.campaigns (slug);

create table public.campaign_actions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns (id) on delete cascade,
  distribution_target_id uuid references public.distribution_targets (id) on delete cascade,
  action text not null,
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

-- Aggregate-only QR/anonymous scan log: campaign slug, coarse referrer, day.
create table public.qr_scans (
  id uuid primary key default gen_random_uuid(),
  campaign_slug text not null,
  referrer_host text,
  scan_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index qr_scans_slug_idx on public.qr_scans (campaign_slug, scan_date);

-- ---------------------------------------------------------------------------
-- Transmissions to law enforcement
-- ---------------------------------------------------------------------------

create table public.transmissions (
  id uuid primary key default gen_random_uuid(),
  recipient_name text not null,
  recipient_email text,
  recipient_phone text,
  method text not null check (method in ('email','phone','in_person','portal','mail','other')),
  transmitted_at timestamptz,
  summary text not null default '',
  delivery_status text not null default 'draft'
    check (delivery_status in ('draft','prepared','sent','delivered','acknowledged','failed','follow_up_required')),
  acknowledgment_received boolean not null default false,
  reference_number text,
  follow_up_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id)
);

create index transmissions_status_idx on public.transmissions (delivery_status);

create table public.transmission_leads (
  id uuid primary key default gen_random_uuid(),
  transmission_id uuid not null references public.transmissions (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  unique (transmission_id, lead_id)
);

create table public.transmission_attachments (
  id uuid primary key default gen_random_uuid(),
  transmission_id uuid not null references public.transmissions (id) on delete cascade,
  attachment_id uuid not null references public.attachments (id) on delete restrict,
  sha256_at_transmission text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  unique (transmission_id, attachment_id)
);

-- ---------------------------------------------------------------------------
-- Audit (append-only)
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null check (action in ('create','view_sensitive_record','update','soft_delete','restore',
    'download_private_attachment','generate_signed_url','export','transmit','login','role_change','settings_change')),
  entity_type text not null,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  reason text,
  request_id text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index audit_events_created_idx on public.audit_events (created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);

-- No role may modify or delete historical audit records — enforced even for
-- table owners via trigger (RLS additionally blocks all client access).
create or replace function public.audit_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_events are append-only';
end;
$$;

create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function public.audit_events_immutable();

-- ---------------------------------------------------------------------------
-- updated_at triggers for every table that has the column
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'users','user_roles','cases','case_contacts','sources','source_snapshots',
    'official_updates','timeline_entries','public_assets','site_settings','translations',
    'leads','lead_notes','lead_status_history','lead_duplicate_suggestions','attachments',
    'entities','lead_entities','entity_relationships','distribution_targets','campaigns',
    'campaign_actions','qr_scans','transmissions','transmission_leads','transmission_attachments'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('private-originals', 'private-originals', false)
on conflict (id) do nothing;
