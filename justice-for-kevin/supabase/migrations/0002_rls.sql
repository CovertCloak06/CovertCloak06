-- ============================================================================
-- Row-Level Security. RLS is the authoritative authorization boundary; the
-- application's role checks are defense-in-depth on top of these policies.
--
-- Anonymous (public) users: read approved public content only.
-- Authenticated users: access is derived from user_roles via helper
-- functions defined in 0001_schema.sql. The service role bypasses RLS and is
-- used only by trusted server code (audit writes, secure intake, signed URLs).
-- ============================================================================

alter table public.users enable row level security;
alter table public.user_roles enable row level security;
alter table public.cases enable row level security;
alter table public.case_contacts enable row level security;
alter table public.sources enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.official_updates enable row level security;
alter table public.timeline_entries enable row level security;
alter table public.public_assets enable row level security;
alter table public.site_settings enable row level security;
alter table public.translations enable row level security;
alter table public.leads enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_status_history enable row level security;
alter table public.lead_duplicate_suggestions enable row level security;
alter table public.attachments enable row level security;
alter table public.entities enable row level security;
alter table public.lead_entities enable row level security;
alter table public.entity_relationships enable row level security;
alter table public.distribution_targets enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_actions enable row level security;
alter table public.qr_scans enable row level security;
alter table public.transmissions enable row level security;
alter table public.transmission_leads enable row level security;
alter table public.transmission_attachments enable row level security;
alter table public.audit_events enable row level security;

-- ---------------------------------------------------------------------------
-- Convenience role groupings
-- ---------------------------------------------------------------------------
-- staff        = any dashboard role
-- content_mgrs = owner, administrator, outreach (public content)
-- lead_mgrs    = owner, administrator, reviewer (leads/entities)
-- admins       = owner, administrator
-- ---------------------------------------------------------------------------

-- users --------------------------------------------------------------------
create policy users_self_read on public.users
  for select using (id = auth.uid() or public.has_any_role(array['owner','administrator']));
create policy users_self_update on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy users_admin_insert on public.users
  for insert with check (public.has_any_role(array['owner','administrator']) or id = auth.uid());

-- user_roles: readable by self + admins; managed only by owner/administrator.
create policy user_roles_read on public.user_roles
  for select using (user_id = auth.uid() or public.has_any_role(array['owner','administrator']));
create policy user_roles_manage on public.user_roles
  for all using (public.has_any_role(array['owner','administrator']))
  with check (public.has_any_role(array['owner','administrator']));

-- cases: public read; content managers write ------------------------------
create policy cases_public_read on public.cases for select using (true);
create policy cases_manage on public.cases
  for all using (public.has_any_role(array['owner','administrator']))
  with check (public.has_any_role(array['owner','administrator']));

create policy case_contacts_public_read on public.case_contacts
  for select using (is_public or public.has_any_role(array['owner','administrator','reviewer','outreach','read_only']));
create policy case_contacts_manage on public.case_contacts
  for all using (public.has_any_role(array['owner','administrator']))
  with check (public.has_any_role(array['owner','administrator']));

-- sources: public may read approved rows ----------------------------------
create policy sources_public_read on public.sources
  for select using (approved or public.has_any_role(array['owner','administrator','reviewer','outreach','read_only']));
create policy sources_manage on public.sources
  for all using (public.has_any_role(array['owner','administrator','reviewer']))
  with check (public.has_any_role(array['owner','administrator','reviewer']));

create policy source_snapshots_staff_read on public.source_snapshots
  for select using (public.has_any_role(array['owner','administrator','reviewer','outreach','read_only']));
create policy source_snapshots_manage on public.source_snapshots
  for all using (public.has_any_role(array['owner','administrator','reviewer']))
  with check (public.has_any_role(array['owner','administrator','reviewer']));

-- official updates / timeline / assets: public reads approved only ---------
create policy official_updates_public_read on public.official_updates
  for select using (approved or public.has_any_role(array['owner','administrator','reviewer','outreach','read_only']));
create policy official_updates_manage on public.official_updates
  for all using (public.has_any_role(array['owner','administrator','outreach']))
  with check (public.has_any_role(array['owner','administrator','outreach']));

create policy timeline_public_read on public.timeline_entries
  for select using (approved or public.has_any_role(array['owner','administrator','reviewer','outreach','read_only']));
create policy timeline_manage on public.timeline_entries
  for all using (public.has_any_role(array['owner','administrator','outreach']))
  with check (public.has_any_role(array['owner','administrator','outreach']));

create policy public_assets_public_read on public.public_assets
  for select using (approved or public.has_any_role(array['owner','administrator','reviewer','outreach','read_only']));
create policy public_assets_manage on public.public_assets
  for all using (public.has_any_role(array['owner','administrator','outreach']))
  with check (public.has_any_role(array['owner','administrator','outreach']));

-- site settings: public rows readable by anyone; writes admin-only ---------
create policy site_settings_public_read on public.site_settings
  for select using (public or public.has_any_role(array['owner','administrator','reviewer','outreach','read_only']));
create policy site_settings_manage on public.site_settings
  for all using (public.has_any_role(array['owner','administrator']))
  with check (public.has_any_role(array['owner','administrator']));

create policy translations_public_read on public.translations for select using (true);
create policy translations_manage on public.translations
  for all using (public.has_any_role(array['owner','administrator','outreach']))
  with check (public.has_any_role(array['owner','administrator','outreach']));

-- leads: NEVER publicly readable -------------------------------------------
create policy leads_staff_read on public.leads
  for select using (public.has_any_role(array['owner','administrator','reviewer','read_only']));
create policy leads_manage on public.leads
  for insert with check (public.has_any_role(array['owner','administrator','reviewer']));
create policy leads_update on public.leads
  for update using (public.has_any_role(array['owner','administrator','reviewer']))
  with check (public.has_any_role(array['owner','administrator','reviewer']));
-- No client-side DELETE on leads at all (soft delete via status/deleted_at).

create policy lead_notes_read on public.lead_notes
  for select using (public.has_any_role(array['owner','administrator','reviewer','read_only']));
create policy lead_notes_manage on public.lead_notes
  for insert with check (public.has_any_role(array['owner','administrator','reviewer']));

create policy lead_status_history_read on public.lead_status_history
  for select using (public.has_any_role(array['owner','administrator','reviewer','read_only']));
create policy lead_status_history_insert on public.lead_status_history
  for insert with check (public.has_any_role(array['owner','administrator','reviewer']));

create policy lead_dupes_read on public.lead_duplicate_suggestions
  for select using (public.has_any_role(array['owner','administrator','reviewer','read_only']));
create policy lead_dupes_manage on public.lead_duplicate_suggestions
  for all using (public.has_any_role(array['owner','administrator','reviewer']))
  with check (public.has_any_role(array['owner','administrator','reviewer']));

-- attachments: metadata for lead managers; file bytes only via signed URLs
-- generated server-side. Deletion restricted to owner (soft delete first).
create policy attachments_read on public.attachments
  for select using (public.has_any_role(array['owner','administrator','reviewer']));
create policy attachments_insert on public.attachments
  for insert with check (public.has_any_role(array['owner','administrator','reviewer']));
create policy attachments_update on public.attachments
  for update using (public.has_any_role(array['owner','administrator','reviewer']))
  with check (public.has_any_role(array['owner','administrator','reviewer']));
create policy attachments_delete_owner_only on public.attachments
  for delete using (public.has_any_role(array['owner']) );

-- entities ------------------------------------------------------------------
create policy entities_read on public.entities
  for select using (public.has_any_role(array['owner','administrator','reviewer','read_only']));
create policy entities_manage on public.entities
  for all using (public.has_any_role(array['owner','administrator','reviewer']))
  with check (public.has_any_role(array['owner','administrator','reviewer']));

create policy lead_entities_read on public.lead_entities
  for select using (public.has_any_role(array['owner','administrator','reviewer','read_only']));
create policy lead_entities_manage on public.lead_entities
  for all using (public.has_any_role(array['owner','administrator','reviewer']))
  with check (public.has_any_role(array['owner','administrator','reviewer']));

create policy entity_relationships_read on public.entity_relationships
  for select using (public.has_any_role(array['owner','administrator','reviewer','read_only']));
create policy entity_relationships_manage on public.entity_relationships
  for all using (public.has_any_role(array['owner','administrator','reviewer']))
  with check (public.has_any_role(array['owner','administrator','reviewer']));

-- distribution / campaigns --------------------------------------------------
create policy distribution_read on public.distribution_targets
  for select using (public.has_any_role(array['owner','administrator','reviewer','outreach','read_only']));
create policy distribution_manage on public.distribution_targets
  for all using (public.has_any_role(array['owner','administrator','outreach']))
  with check (public.has_any_role(array['owner','administrator','outreach']));

create policy campaigns_read on public.campaigns
  for select using (public.has_any_role(array['owner','administrator','reviewer','outreach','read_only']));
create policy campaigns_manage on public.campaigns
  for all using (public.has_any_role(array['owner','administrator','outreach']))
  with check (public.has_any_role(array['owner','administrator','outreach']));

create policy campaign_actions_read on public.campaign_actions
  for select using (public.has_any_role(array['owner','administrator','reviewer','outreach','read_only']));
create policy campaign_actions_manage on public.campaign_actions
  for all using (public.has_any_role(array['owner','administrator','outreach']))
  with check (public.has_any_role(array['owner','administrator','outreach']));

-- qr_scans: inserts happen server-side (service role); staff read aggregates.
create policy qr_scans_read on public.qr_scans
  for select using (public.has_any_role(array['owner','administrator','reviewer','outreach','read_only']));

-- transmissions: no client access for outreach/read_only beyond read --------
create policy transmissions_read on public.transmissions
  for select using (public.has_any_role(array['owner','administrator','reviewer']));
create policy transmissions_manage on public.transmissions
  for all using (public.has_any_role(array['owner','administrator']))
  with check (public.has_any_role(array['owner','administrator']));

create policy transmission_leads_read on public.transmission_leads
  for select using (public.has_any_role(array['owner','administrator','reviewer']));
create policy transmission_leads_manage on public.transmission_leads
  for all using (public.has_any_role(array['owner','administrator']))
  with check (public.has_any_role(array['owner','administrator']));

create policy transmission_attachments_read on public.transmission_attachments
  for select using (public.has_any_role(array['owner','administrator','reviewer']));
create policy transmission_attachments_manage on public.transmission_attachments
  for all using (public.has_any_role(array['owner','administrator']))
  with check (public.has_any_role(array['owner','administrator']));

-- audit_events: owner/administrator may read; NOBODY may write from the
-- client (inserts use the service role; updates/deletes are blocked by
-- trigger even for the service role). Export restricted to owner in app.
create policy audit_read on public.audit_events
  for select using (public.has_any_role(array['owner','administrator']));

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------

-- public-assets: world-readable, content managers write.
create policy "public assets are readable" on storage.objects
  for select using (bucket_id = 'public-assets');
create policy "public assets managed by content roles" on storage.objects
  for insert with check (bucket_id = 'public-assets'
    and public.has_any_role(array['owner','administrator','outreach']));
create policy "public assets updated by content roles" on storage.objects
  for update using (bucket_id = 'public-assets'
    and public.has_any_role(array['owner','administrator','outreach']));

-- private-originals: NO anonymous or authenticated client access at all.
-- Reads happen exclusively through short-lived signed URLs generated by
-- trusted server code with the service role; uploads flow through the
-- secure-intake server action. (No policies created = no access.)
