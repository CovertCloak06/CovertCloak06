-- Atomic campaign scan counter. The application previously did a
-- read-modify-write from the server, which under-counts when scans overlap;
-- this single UPDATE statement increments and stamps first/last scan
-- atomically. Called with the service role only (no EXECUTE for anon).

create or replace function public.record_campaign_scan(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.campaigns
  set scan_count = scan_count + 1,
      first_scan_at = coalesce(first_scan_at, now()),
      last_scan_at = now()
  where slug = p_slug;
$$;

revoke execute on function public.record_campaign_scan(text) from public, anon, authenticated;
