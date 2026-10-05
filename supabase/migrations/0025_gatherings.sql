-- Serendine: plan a night out. A signed-in guest picks a Serendine venue, a date and a group size,
-- shares a link on WhatsApp, friends say "I'm in", and the venue confirms (or suggests another time).
-- No tickets or payments. Each venue switches group requests on when it's ready.
-- Needs updates 0019 and 0024 first.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

alter table venues add column if not exists groups_enabled boolean not null default false;

create table if not exists gatherings (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  venue_id      uuid not null references venues(id) on delete cascade,
  organiser     uuid not null references auth.users(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 80),
  starts_at     timestamptz not null,
  party_size    integer not null check (party_size between 2 and 60),
  note          text check (note is null or char_length(note) <= 300),
  status        text not null default 'requested'
                check (status in ('requested', 'confirmed', 'suggested', 'declined', 'cancelled')),
  suggested_at  timestamptz,                 -- the venue's alternative time
  venue_note    text check (venue_note is null or char_length(venue_note) <= 200),
  answered_by   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists gatherings_venue on gatherings (venue_id, starts_at);
create index if not exists gatherings_organiser on gatherings (organiser, starts_at desc);

create table if not exists gathering_members (
  gathering_id  uuid not null references gatherings(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 40),
  rsvp          text not null default 'going' check (rsvp in ('going', 'maybe', 'no')),
  joined_at     timestamptz not null default now(),
  primary key (gathering_id, user_id)
);

alter table gatherings enable row level security;          -- everything goes through the functions below
alter table gathering_members enable row level security;
drop policy if exists gatherings_read on gatherings;
create policy gatherings_read on gatherings for select using (
  organiser = auth.uid() or is_venue_member(venue_id)
  or exists (select 1 from gathering_members m where m.gathering_id = gatherings.id and m.user_id = auth.uid())
);
do $$ begin
  alter publication supabase_realtime add table gatherings;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Venues a guest can plan a night at (public: it's a list of places)
create or replace function bookable_venues()
returns table (id uuid, name text, slug text, kind text, place text, accent text, has_logo boolean, brand_version bigint)
language sql stable security definer set search_path = public as $$
  select v.id, v.name, v.slug, v.kind, v.place, v.theme_accent, v.logo_data is not null,
         extract(epoch from v.brand_updated_at)::bigint
  from venues v where v.groups_enabled
  order by v.name;
$$;
grant execute on function bookable_venues() to anon, authenticated;

-- 1. The organiser asks
create or replace function create_gathering(p_venue uuid, p_title text, p_starts_at timestamptz,
                                            p_party_size integer, p_note text, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare g gatherings;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if exists (select 1 from banned_users where user_id = auth.uid()) then raise exception 'This account can no longer use Serendine'; end if;
  if not exists (select 1 from venues where id = p_venue and groups_enabled) then
    raise exception 'This venue is not taking group requests on Serendine yet';
  end if;
  if p_starts_at < now() + interval '1 hour' then raise exception 'Pick a time at least an hour from now'; end if;
  if p_starts_at > now() + interval '120 days' then raise exception 'Pick a date within the next four months'; end if;
  if (select count(*) from gatherings where organiser = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'That''s plenty of plans for one day';
  end if;
  insert into gatherings (venue_id, organiser, title, starts_at, party_size, note)
    values (p_venue, auth.uid(), left(trim(p_title), 80), p_starts_at, p_party_size,
            nullif(left(trim(coalesce(p_note, '')), 300), ''))
    returning * into g;
  insert into gathering_members (gathering_id, user_id, name)
    values (g.id, auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'Organiser'), 40));
  return g.code;
end;
$$;
grant execute on function create_gathering(uuid, text, timestamptz, integer, text, text) to authenticated;

-- 2. The invite page (anyone with the link sees the basics; members see who's coming)
create or replace function gathering_by_code(p_code text)
returns table (id uuid, code text, title text, starts_at timestamptz, party_size integer, note text, status text,
               suggested_at timestamptz, venue_note text, venue_id uuid, venue_name text, venue_slug text, place text,
               organiser_name text, going integer, i_am_organiser boolean, my_rsvp text, members jsonb)
language sql stable security definer set search_path = public as $$
  select g.id, g.code, g.title, g.starts_at, g.party_size, g.note, g.status, g.suggested_at, g.venue_note,
         v.id, v.name, v.slug, v.place,
         (select m.name from gathering_members m where m.gathering_id = g.id and m.user_id = g.organiser),
         (select count(*)::int from gathering_members m where m.gathering_id = g.id and m.rsvp = 'going'),
         g.organiser = auth.uid(),
         (select m.rsvp from gathering_members m where m.gathering_id = g.id and m.user_id = auth.uid()),
         case when exists (select 1 from gathering_members m where m.gathering_id = g.id and m.user_id = auth.uid())
              then (select jsonb_agg(jsonb_build_object('name', m.name, 'rsvp', m.rsvp) order by m.joined_at)
                    from gathering_members m where m.gathering_id = g.id)
              else '[]'::jsonb end
  from gatherings g join venues v on v.id = g.venue_id
  where g.code = p_code;
$$;
grant execute on function gathering_by_code(text) to anon, authenticated;

-- 3. Friends answer
create or replace function rsvp_gathering(p_code text, p_name text, p_rsvp text)
returns void language plpgsql security definer set search_path = public as $$
declare g gatherings;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if p_rsvp not in ('going', 'maybe', 'no') then raise exception 'bad answer'; end if;
  select * into g from gatherings where code = p_code;
  if not found then raise exception 'This plan no longer exists'; end if;
  if g.status in ('cancelled', 'declined') then raise exception 'This plan has been called off'; end if;
  if g.starts_at < now() - interval '6 hours' then raise exception 'This night out has already happened'; end if;
  if (select count(*) from gathering_members where gathering_id = g.id) >= 80 then raise exception 'This plan is full'; end if;
  insert into gathering_members (gathering_id, user_id, name, rsvp)
    values (g.id, auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'Guest'), 40), p_rsvp)
  on conflict (gathering_id, user_id) do update
    set rsvp = excluded.rsvp, name = coalesce(nullif(trim(p_name), ''), gathering_members.name);
end;
$$;
grant execute on function rsvp_gathering(text, text, text) to authenticated;

-- 4. The organiser: cancel, or accept the venue's suggested time
create or replace function organiser_update_gathering(p_code text, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare g gatherings;
begin
  select * into g from gatherings where code = p_code;
  if not found or g.organiser <> auth.uid() then raise exception 'Not allowed'; end if;
  if p_action = 'cancel' then
    update gatherings set status = 'cancelled', updated_at = now() where id = g.id;
  elsif p_action = 'accept_time' and g.status = 'suggested' and g.suggested_at is not null then
    update gatherings set starts_at = g.suggested_at, suggested_at = null, status = 'confirmed', updated_at = now() where id = g.id;
  else
    raise exception 'Nothing to change';
  end if;
end;
$$;
grant execute on function organiser_update_gathering(text, text) to authenticated;

-- My plans
create or replace function my_gatherings()
returns table (code text, title text, starts_at timestamptz, status text, venue_name text, going integer, i_am_organiser boolean)
language sql stable security definer set search_path = public as $$
  select g.code, g.title, g.starts_at, g.status, v.name,
         (select count(*)::int from gathering_members m where m.gathering_id = g.id and m.rsvp = 'going'),
         g.organiser = auth.uid()
  from gatherings g join venues v on v.id = g.venue_id
  where exists (select 1 from gathering_members m where m.gathering_id = g.id and m.user_id = auth.uid())
    and g.starts_at > now() - interval '2 days'
  order by g.starts_at;
$$;
grant execute on function my_gatherings() to authenticated;

-- 5. The venue: upcoming group requests, and the answer
create or replace function venue_gatherings(v uuid)
returns table (id uuid, code text, title text, starts_at timestamptz, party_size integer, note text, status text,
               suggested_at timestamptz, organiser_name text, organiser_email text, going integer, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.code, g.title, g.starts_at, g.party_size, g.note, g.status, g.suggested_at,
         (select m.name from gathering_members m where m.gathering_id = g.id and m.user_id = g.organiser),
         (select u.email from auth.users u where u.id = g.organiser),
         (select count(*)::int from gathering_members m where m.gathering_id = g.id and m.rsvp = 'going'),
         g.created_at
  from gatherings g
  where g.venue_id = v and is_venue_member(v)
    and g.starts_at > now() - interval '6 hours'
    and g.status <> 'cancelled'
  order by (g.status = 'requested') desc, g.starts_at;
$$;
grant execute on function venue_gatherings(uuid) to authenticated;

create or replace function answer_gathering(p_id uuid, p_action text, p_time timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare g gatherings;
begin
  select * into g from gatherings where id = p_id;
  if not found or not is_venue_member(g.venue_id) then raise exception 'Not allowed'; end if;
  if p_action = 'confirm' then
    update gatherings set status = 'confirmed', suggested_at = null, venue_note = nullif(left(trim(coalesce(p_note, '')), 200), ''),
           answered_by = staff_first_name(), updated_at = now() where id = g.id;
  elsif p_action = 'decline' then
    update gatherings set status = 'declined', venue_note = nullif(left(trim(coalesce(p_note, '')), 200), ''),
           answered_by = staff_first_name(), updated_at = now() where id = g.id;
  elsif p_action = 'suggest' then
    if p_time is null or p_time < now() then raise exception 'Pick a time in the future'; end if;
    update gatherings set status = 'suggested', suggested_at = p_time, venue_note = nullif(left(trim(coalesce(p_note, '')), 200), ''),
           answered_by = staff_first_name(), updated_at = now() where id = g.id;
  else
    raise exception 'Unknown answer';
  end if;
end;
$$;
grant execute on function answer_gathering(uuid, text, timestamptz, text) to authenticated;

-- 6. Notifications: a new request → the venue's staff; the venue's answer → everyone in the plan
create or replace function push_for_gathering(p_id uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth,
         'Group request · ' || g.party_size || ' people',
         g.title || ' · ' || to_char(g.starts_at at time zone 'Asia/Dubai', 'Dy DD Mon, HH24:MI'),
         '/staff?v=' || v.slug, 'gathering-' || g.id::text
  from gatherings g
  join venues v on v.id = g.venue_id
  join venue_members vm on vm.venue_id = g.venue_id
  join push_subscriptions ps on ps.user_id = vm.user_id
  where g.id = p_id and g.organiser = auth.uid() and g.status = 'requested'
    and g.created_at > now() - interval '1 minute'
  union all
  select ps.endpoint, ps.p256dh, ps.auth,
         v.name || case g.status when 'confirmed' then ' confirmed your table' when 'suggested' then ' suggested another time'
                                 when 'declined' then ' can''t take this booking' else '' end,
         g.title, '/g/' || g.code, 'gathering-' || g.id::text
  from gatherings g
  join venues v on v.id = g.venue_id
  join gathering_members m on m.gathering_id = g.id and m.rsvp <> 'no'
  join push_subscriptions ps on ps.user_id = m.user_id
  where g.id = p_id and is_venue_member(g.venue_id) and g.status in ('confirmed', 'suggested', 'declined')
    and g.updated_at > now() - interval '1 minute';
$$;
grant execute on function push_for_gathering(uuid) to authenticated;
