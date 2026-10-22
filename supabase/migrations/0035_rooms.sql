-- Serendine: neighbourhood rooms ("chat nearby").
--  • Dubai is divided into neighbourhoods (Dubai Marina, JLT, Downtown…). A guest joins one, picked by them or
--    suggested by their phone. The phone works out the neighbourhood itself: an exact location is never sent here.
--  • In a room you see posts from your neighbourhood and the ones next to it, each labelled with its area.
--  • 18+ only (a saved date of birth is required), report and block, and moderation by the Serendine admin and by
--    managers of venues in that neighbourhood. No live location is ever shared. Posts disappear after 24 hours.
--  • Each room features the Serendine venues in that area and the ones next to it.
-- Needs updates 0019, 0025, 0028 and 0031 first.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

-- 1. Neighbourhoods ---------------------------------------------------------------------------

create table if not exists areas (
  slug  text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name  text not null,
  city  text not null default 'Dubai',
  lat   double precision not null,       -- centre of the area (public, approximate)
  lng   double precision not null
);
alter table areas enable row level security;
drop policy if exists areas_read on areas;
create policy areas_read on areas for select using (true);
grant select on areas to anon, authenticated;

insert into areas (slug, name, lat, lng) values
  ('dubai-marina',      'Dubai Marina',           25.0805, 55.1403),
  ('jbr',               'JBR',                    25.0780, 55.1330),
  ('jlt',               'JLT',                    25.0693, 55.1418),
  ('palm-jumeirah',     'Palm Jumeirah',          25.1124, 55.1390),
  ('media-city',        'Media & Internet City',  25.0950, 55.1580),
  ('barsha-heights',    'Barsha Heights',         25.0990, 55.1750),
  ('al-barsha',         'Al Barsha',              25.1110, 55.2000),
  ('umm-suqeim',        'Umm Suqeim',             25.1450, 55.2050),
  ('al-quoz',           'Al Quoz',                25.1400, 55.2300),
  ('jumeirah',          'Jumeirah',               25.2050, 55.2500),
  ('city-walk',         'City Walk & Al Wasl',    25.2070, 55.2630),
  ('downtown',          'Downtown Dubai',         25.1972, 55.2744),
  ('business-bay',      'Business Bay',           25.1850, 55.2650),
  ('difc',              'DIFC',                   25.2120, 55.2810),
  ('bur-dubai',         'Bur Dubai & Al Seef',    25.2550, 55.2950),
  ('karama',            'Karama & Oud Metha',     25.2400, 55.3050),
  ('deira',             'Deira',                  25.2700, 55.3200),
  ('creek-harbour',     'Dubai Creek Harbour',    25.2000, 55.3450),
  ('dubai-hills',       'Dubai Hills',            25.1100, 55.2450),
  ('jvc',               'JVC & JVT',              25.0600, 55.2100),
  ('sports-city',       'Sports City & Motor City', 25.0450, 55.2300),
  ('arabian-ranches',   'Arabian Ranches',        25.0500, 55.2700),
  ('silicon-oasis',     'Silicon Oasis',          25.1200, 55.3800),
  ('mirdif',            'Mirdif',                 25.2200, 55.4200)
on conflict (slug) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng;

-- Distance between two area centres, in km.
create or replace function area_km(a areas, b areas)
returns double precision language sql immutable as $$
  select 6371 * 2 * asin(sqrt(power(sin(radians(b.lat - a.lat) / 2), 2)
         + cos(radians(a.lat)) * cos(radians(b.lat)) * power(sin(radians(b.lng - a.lng) / 2), 2)));
$$;

-- An area and its neighbours (centres within 5 km).
create or replace function area_and_neighbours(p_area text)
returns table (slug text, name text, km numeric)
language sql stable security definer set search_path = public as $$
  select b.slug, b.name, round(area_km(a, b)::numeric, 1)
  from areas a join areas b on b.slug = a.slug or area_km(a, b) <= 5
  where a.slug = p_area
  order by area_km(a, b);
$$;
grant execute on function area_and_neighbours(text) to anon, authenticated;

-- Venues can be placed in a neighbourhood (set on the admin venue page).
alter table venues add column if not exists area text references areas(slug) on delete set null;

create or replace function admin_set_venue_area(v uuid, p_area text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if p_area is not null and not exists (select 1 from areas where slug = p_area) then raise exception 'Unknown area'; end if;
  update venues set area = p_area where id = v;
end;
$$;
grant execute on function admin_set_venue_area(uuid, text) to authenticated;

-- 2. Members and posts ------------------------------------------------------------------------

create table if not exists area_members (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  area        text not null references areas(slug) on delete cascade,
  alias       text not null check (char_length(alias) between 1 and 30),
  joined_at   timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists area_members_area on area_members (area, last_seen);

create table if not exists area_posts (
  id          bigint generated always as identity primary key,
  area        text not null references areas(slug) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  alias       text not null,
  body        text not null check (char_length(body) between 1 and 500),
  hidden_at   timestamptz,
  hidden_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists area_posts_feed on area_posts (area, created_at desc);

alter table area_members enable row level security;     -- all through the functions below
alter table area_posts enable row level security;

-- 18+ and a saved profile are required; banned accounts can't join.
create or replace function area_can_join()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and not exists (select 1 from banned_users where user_id = auth.uid())
     and exists (select 1 from profiles p where p.user_id = auth.uid() and p.completed_at is not null
                   and p.birth_date <= (current_date - interval '18 years')::date);
$$;

-- Where am I? (the guest's current room, if any)
create or replace function my_area()
returns table (area text, area_name text, alias text, suggested_alias text, can_join boolean)
language sql stable security definer set search_path = public as $$
  select m.area, a.name, m.alias,
         coalesce(m.alias, (select last_alias from profiles where user_id = auth.uid())),
         area_can_join()
  from (select 1) one
  left join area_members m on m.user_id = auth.uid()
  left join areas a on a.slug = m.area;
$$;
grant execute on function my_area() to authenticated;

create or replace function join_area(p_area text, p_alias text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not area_can_join() then raise exception 'Neighbourhood rooms are for over-18s with saved details. Add your details first.'; end if;
  if not exists (select 1 from areas where slug = p_area) then raise exception 'Unknown area'; end if;
  if char_length(trim(coalesce(p_alias, ''))) = 0 then raise exception 'Choose a screen name'; end if;
  insert into area_members (user_id, area, alias) values (auth.uid(), p_area, left(trim(p_alias), 30))
  on conflict (user_id) do update set area = excluded.area, alias = excluded.alias, joined_at = now(), last_seen = now();
end;
$$;
grant execute on function join_area(text, text) to authenticated;

create or replace function leave_area()
returns void language sql security definer set search_path = public as $$
  delete from area_members where user_id = auth.uid();
$$;
grant execute on function leave_area() to authenticated;

-- Moderators: the Serendine admin, and managers of venues in that neighbourhood.
create or replace function area_moderator(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select is_platform_admin()
      or exists (select 1 from venues v join venue_members m on m.venue_id = v.id
                 where v.area = p_area and m.user_id = auth.uid() and m.role = 'manager');
$$;

-- The room: the last 24 hours from my area and its neighbours, without anyone I've blocked (or who blocked me).
create or replace function area_feed(p_after bigint default 0)
returns table (id bigint, area text, area_name text, alias text, body text, created_at timestamptz,
               mine boolean, can_hide boolean)
language plpgsql security definer set search_path = public as $$
declare me area_members;
begin
  select * into me from area_members where user_id = auth.uid();
  if not found then return; end if;
  update area_members set last_seen = now() where user_id = auth.uid() and last_seen < now() - interval '1 minute';
  return query
    select p.id, p.area, a.name, p.alias, p.body, p.created_at, p.user_id = auth.uid(), area_moderator(p.area)
    from area_posts p
    join areas a on a.slug = p.area
    where p.area in (select n.slug from area_and_neighbours(me.area) n)
      and p.hidden_at is null
      and p.created_at > now() - interval '24 hours'
      and p.id > coalesce(p_after, 0)
      and not exists (select 1 from blocks b where (b.blocker_user = auth.uid() and b.blocked_user = p.user_id)
                                              or (b.blocker_user = p.user_id and b.blocked_user = auth.uid()))
    order by p.id desc
    limit 200;
end;
$$;
grant execute on function area_feed(bigint) to authenticated;

-- How many people are in my area and the ones next to it right now (seen in the last 2 hours).
create or replace function area_counts()
returns table (area text, area_name text, people bigint)
language sql stable security definer set search_path = public as $$
  select n.slug, n.name, (select count(*) from area_members m where m.area = n.slug and m.last_seen > now() - interval '2 hours')
  from area_members me cross join lateral area_and_neighbours(me.area) n
  where me.user_id = auth.uid();
$$;
grant execute on function area_counts() to authenticated;

create or replace function post_area(p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare me area_members; new_id bigint; b text := trim(coalesce(p_body, ''));
begin
  if not area_can_join() then raise exception 'Neighbourhood rooms are for over-18s with saved details.'; end if;
  select * into me from area_members where user_id = auth.uid();
  if not found then raise exception 'Join a neighbourhood first'; end if;
  if char_length(b) = 0 then raise exception 'Write something first'; end if;
  if (select count(*) from area_posts where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 6 then
    raise exception 'Slow down a little';
  end if;
  insert into area_posts (area, user_id, alias, body) values (me.area, auth.uid(), me.alias, left(b, 500)) returning id into new_id;
  update area_members set last_seen = now() where user_id = auth.uid();
  delete from area_posts where created_at < now() - interval '2 days';   -- tidy up old posts as we go
  return new_id;
end;
$$;
grant execute on function post_area(text) to authenticated;

create or replace function delete_my_area_post(p_id bigint)
returns void language sql security definer set search_path = public as $$
  delete from area_posts where id = p_id and user_id = auth.uid();
$$;
grant execute on function delete_my_area_post(bigint) to authenticated;

-- Moderators hide a post (kept, hidden, for the admin's review).
create or replace function hide_area_post(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare p area_posts;
begin
  select * into p from area_posts where id = p_id;
  if not found then return; end if;
  if not area_moderator(p.area) then raise exception 'Only moderators can hide posts'; end if;
  update area_posts set hidden_at = now(), hidden_by = auth.uid() where id = p_id;
end;
$$;
grant execute on function hide_area_post(bigint) to authenticated;

-- Block the person behind a post (they disappear from your rooms and chats, and you from theirs; they aren't told).
create or replace function block_area_poster(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  select user_id into u from area_posts where id = p_id;
  if u is null or u = auth.uid() then return; end if;
  insert into blocks (blocker_user, blocked_user) values (auth.uid(), u) on conflict do nothing;
end;
$$;
grant execute on function block_area_poster(bigint) to authenticated;

-- Report a post: it goes to the Serendine admin's reports with the post as evidence, and is blocked for you.
create or replace function report_area_post(p_id bigint, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare p area_posts;
begin
  select * into p from area_posts where id = p_id;
  if not found or p.user_id = auth.uid() then return; end if;
  insert into reports (reporter_user, reported_user, reason, evidence)
    values (auth.uid(), p.user_id, nullif(left(trim(coalesce(p_reason, '')), 500), ''),
            jsonb_build_array(jsonb_build_object('from', 'them', 'text', p.body, 'where', 'Neighbourhood room: ' || p.area,
                                                 'alias', p.alias, 'at', p.created_at)));
  insert into blocks (blocker_user, blocked_user) values (auth.uid(), p.user_id) on conflict do nothing;
end;
$$;
grant execute on function report_area_post(bigint, text) to authenticated;

-- 3. Venues featured in the room ------------------------------------------------------------

create or replace function area_venues()
returns table (id uuid, name text, slug text, area_name text, place text, has_logo boolean, brand_version bigint,
               accent text, groups_enabled boolean, here_now bigint)
language sql stable security definer set search_path = public as $$
  select v.id, v.name, v.slug, a.name, v.place, v.logo_data is not null, extract(epoch from v.brand_updated_at)::bigint,
         v.theme_accent, coalesce(v.groups_enabled, false),
         (select count(*) from visits vi where vi.venue_id = v.id and vi.ended_at is null)
  from area_members me
  cross join lateral area_and_neighbours(me.area) n
  join venues v on v.area = n.slug
  join areas a on a.slug = v.area
  where me.user_id = auth.uid() and v.kind = 'venue' and venue_open(v.id)
  order by (v.area = me.area) desc, v.name
  limit 12;
$$;
grant execute on function area_venues() to authenticated;
