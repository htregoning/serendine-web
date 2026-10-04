-- Serendine: messages from the venue to everyone checked in.
-- "Last orders in 15 minutes", "Happy hour ends at 8", "Running low on oysters",
-- a flash special. Paste into Supabase › SQL Editor › New query, then Run.
-- Safe to run more than once.

create table if not exists venue_announcements (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  kind       text not null default 'general'
             check (kind in ('last_orders', 'happy_hour', 'running_low', 'special', 'general')),
  body       text not null check (char_length(body) between 1 and 200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour'
);
create index if not exists venue_announcements_venue on venue_announcements (venue_id, created_at desc);
alter table venue_announcements enable row level security;

-- Guests checked in at the venue, and its team, can read them (needed for live updates).
drop policy if exists announcements_read on venue_announcements;
create policy announcements_read on venue_announcements for select using (
  is_venue_member(venue_id)
  or exists (select 1 from visits v where v.venue_id = venue_announcements.venue_id
             and v.user_id = auth.uid() and v.ended_at is null)
);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'venue_announcements') then
    alter publication supabase_realtime add table venue_announcements;
  end if;
end $$;

-- Guests can mute venue messages for the rest of their visit.
alter table visits add column if not exists mute_venue boolean not null default false;

create or replace function set_venue_mute(p_mute boolean)
returns void language sql security definer set search_path = public as $$
  update visits set mute_venue = p_mute where user_id = auth.uid() and ended_at is null;
$$;
grant execute on function set_venue_mute(boolean) to authenticated;

-- Staff and managers send a message. At most 6 an hour, so guests aren't flooded.
create or replace function post_announcement(v uuid, p_kind text, p_body text, p_minutes int default 60)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not (is_venue_member(v) or is_platform_admin()) then raise exception 'Not allowed'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'Write a message first'; end if;
  if (select count(*) from venue_announcements
      where venue_id = v and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'That''s 6 messages this hour. Guests will start muting them, so wait a little.';
  end if;
  insert into venue_announcements (venue_id, kind, body, created_by, expires_at)
    values (v, coalesce(p_kind, 'general'), left(trim(p_body), 200), auth.uid(),
            now() + make_interval(mins => greatest(5, least(coalesce(p_minutes, 60), 480))))
    returning id into new_id;
  return new_id;
end;
$$;
grant execute on function post_announcement(uuid, text, text, int) to authenticated;

-- Take a message down early.
create or replace function end_announcement(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select venue_id into v from venue_announcements where id = p_id;
  if v is null or not (is_venue_member(v) or is_platform_admin()) then raise exception 'Not allowed'; end if;
  update venue_announcements set expires_at = now() where id = p_id;
end;
$$;
grant execute on function end_announcement(uuid) to authenticated;

-- Who gets a notification: everyone checked in now who hasn't muted the venue.
-- Only the sender, within a minute of sending.
create or replace function push_for_announcement(p_id uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth, ve.name::text, a.body,
         '/t/' || t.qr_token || '/room', 'venue-' || a.venue_id::text
  from venue_announcements a
  join venues ve on ve.id = a.venue_id
  join visits vi on vi.venue_id = a.venue_id and vi.ended_at is null and not vi.mute_venue
  join venue_tables t on t.id = vi.table_id
  join push_subscriptions ps on ps.user_id = vi.user_id
  where a.id = p_id
    and a.created_by = auth.uid()
    and a.created_at > now() - interval '1 minute';
$$;
grant execute on function push_for_announcement(uuid) to authenticated;

-- Old messages are tidied away after a day.
create or replace function prune_announcements()
returns void language sql security definer set search_path = public as $$
  delete from venue_announcements where expires_at < now() - interval '1 day';
$$;
revoke execute on function prune_announcements() from public, anon, authenticated;
do $$
begin
  execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'serendine-prune-announcements'$q$;
  execute $q$select cron.schedule('serendine-prune-announcements', '17 4 * * *', 'select public.prune_announcements()')$q$;
exception when others then
  raise notice 'Daily tidy-up not scheduled: %', sqlerrm;
end $$;

-- How many guests are checked in right now (for the staff screen).
create or replace function venue_guests_now(v uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when is_venue_member(v) or is_platform_admin()
              then (select count(*)::int from visits where venue_id = v and ended_at is null) end;
$$;
grant execute on function venue_guests_now(uuid) to authenticated;
