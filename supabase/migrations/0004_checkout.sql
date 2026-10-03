-- Serendine: automatic check-out and tighter edit rights.
-- Paste into Supabase › SQL Editor › New query, then Run.

-- 1. Automatic check-out. A visit ends 8 hours after check-in, even if the guest
--    never tapped Leave. Chats that both people didn't choose to keep are deleted,
--    exactly as when leaving by hand.
create or replace function expire_stale_visits()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  with stale as (
    update visits set ended_at = now(), is_open = false
    where ended_at is null and started_at < now() - interval '8 hours'
    returning id
  )
  select count(*) into n from stale;

  delete from conversations c
  using visits v
  where v.id in (c.visit_a, c.visit_b)
    and v.ended_at is not null
    and not (c.a_keeps and c.b_keeps);

  update service_requests set status = 'cancelled'
  where status in ('sent', 'seen') and created_at < now() - interval '8 hours';

  return n;
end;
$$;
revoke execute on function expire_stale_visits() from public, anon, authenticated;

-- Run it every 15 minutes.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'serendine-expire-visits';
select cron.schedule('serendine-expire-visits', '*/15 * * * *', 'select public.expire_stale_visits()');

-- 2. Guests may only change these parts of their own visit.
revoke update on visits from anon, authenticated;
grant update (is_open, public_key) on visits to authenticated;

-- 3. Service requests: only the status can change (guest cancels, staff progress it).
revoke update on service_requests from anon, authenticated;
grant update (status) on service_requests to authenticated;
