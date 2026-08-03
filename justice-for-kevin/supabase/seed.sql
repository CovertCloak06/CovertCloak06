-- ============================================================================
-- Seed data. Placeholders are explicitly marked needs_verification=true and
-- titled "Replace with verified source" so no fabricated fact ever reads as
-- official. Only the case-contact block reflects the publicly released
-- investigation details supplied by the campaign.
-- ============================================================================

-- Primary case record
insert into public.cases (
  is_primary, victim_name, victim_age, incident_date, incident_location,
  investigating_agency, investigator_name, investigator_badge,
  investigator_phone, investigator_email, case_number, case_status, public_objective
) values (
  true, 'Kevin Vandenbos', 36, '2024-07-11',
  '600 block of Wilbur Avenue, Antioch, California',
  'Antioch Police Department', 'Detective John Cox', '5705',
  '(925) 481-8147', 'jcox@antiochca.gov', '24-6070', 'Open / Active',
  'Identify a person shown in law-enforcement-released surveillance material who may have information relevant to the investigation.'
) on conflict do nothing;

-- Detective contact
insert into public.case_contacts (case_id, name, agency, badge, phone, email, role, is_public)
select id, 'Detective John Cox', 'Antioch Police Department', '5705',
       '(925) 481-8147', 'jcox@antiochca.gov', 'Lead Investigator', true
from public.cases where is_primary
on conflict do nothing;

-- Placeholder sources — REPLACE WITH VERIFIED SOURCES before approving.
insert into public.sources (case_id, title, publisher, source_type, summary, verification_status, approved, needs_verification)
select id,
       'PLACEHOLDER — Replace with verified source (official APD release)',
       'Antioch Police Department', 'law_enforcement',
       'Placeholder for the official law-enforcement release announcing the investigation. Do not approve until the verified source URL and dates are attached.',
       'unverified', false, true
from public.cases where is_primary;

insert into public.sources (case_id, title, publisher, source_type, summary, verification_status, approved, needs_verification)
select id,
       'PLACEHOLDER — Replace with verified source (media report)',
       'TBD', 'media',
       'Placeholder for a media report about the case. Do not approve until verified.',
       'unverified', false, true
from public.cases where is_primary;

-- Placeholder timeline entries — clearly labeled, unapproved.
insert into public.timeline_entries (case_id, event_date, title, summary, verification_type, approved, needs_verification)
select id, '2024-07-11',
       'Incident — Replace with verified source',
       'Placeholder timeline entry for the incident. Attach the verified law-enforcement source and set approved=true only after review.',
       'law_enforcement', false, true
from public.cases where is_primary;

insert into public.timeline_entries (case_id, event_date, title, summary, verification_type, approved, needs_verification)
select id, '2024-07-11',
       'Surveillance material released — Replace with verified source',
       'Placeholder for the release date of the surveillance material showing a potential witness. Verify before approving.',
       'law_enforcement', false, true
from public.cases where is_primary;

-- Default site settings
insert into public.site_settings (key, value, public) values
  ('site_title', 'Unbroken: The Fight for Kevin', true),
  ('site_domain', '', true),
  ('secure_intake_enabled', 'false', true),
  ('attachment_limit_bytes', '104857600', false),
  ('public_timeline_visible', 'true', true),
  ('spanish_enabled', 'true', true),
  ('analytics_enabled', 'false', true),
  ('emergency_notice', '', true),
  ('maintenance_mode', 'false', true),
  ('witness_wording', 'A potential witness or person police are seeking to identify.', true)
on conflict (key) do nothing;

-- Default share templates
insert into public.site_settings (key, value, public) values
  ('share_headline_en', 'Police Need Help Identifying a Potential Witness', true),
  ('share_body_en', 'Antioch Police are seeking help identifying a person who may have information relevant to the July 11, 2024 homicide of Kevin Vandenbos. If you recognize this person or have specific information related to the incident, contact Detective John Cox and reference case 24-6070.', true),
  ('share_headline_es', 'La policía necesita ayuda para identificar a un posible testigo', true),
  ('share_body_es', 'La policía de Antioch busca ayuda para identificar a una persona que podría tener información relevante sobre el homicidio de Kevin Vandenbos ocurrido el 11 de julio de 2024. Si reconoce a esta persona o tiene información específica sobre el incidente, comuníquese con el detective John Cox y mencione el caso 24-6070.', true)
on conflict (key) do nothing;

-- NOTE: the first owner role must be granted after the user signs up:
--   insert into public.users (id, email) values ('<auth-user-uuid>', '<email>');
--   insert into public.user_roles (user_id, role) values ('<auth-user-uuid>', 'owner');
-- See SETUP.md → "Bootstrapping the owner account".
