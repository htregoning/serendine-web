-- Serendine: neighbourhood rooms across the UAE, and quiet rooms that widen automatically.
--  • Adds neighbourhoods in Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah and Al Ain (centres only, approximate).
--  • If fewer than 5 people have been in a room and its neighbours in the last 24 hours, the room also shows
--    areas within 15 km; if that's still quiet, the whole city. It tightens again as it gets busier.
-- Needs update 0035 first.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

insert into areas (slug, name, city, lat, lng) values
  ('ad-corniche',       'Corniche & Al Bateen',     'Abu Dhabi',      24.4700, 54.3400),
  ('ad-tourist-club',   'Tourist Club & Al Zahiyah','Abu Dhabi',      24.4930, 54.3800),
  ('ad-reem',           'Al Reem & Al Maryah',      'Abu Dhabi',      24.4990, 54.4000),
  ('ad-saadiyat',       'Saadiyat Island',          'Abu Dhabi',      24.5400, 54.4300),
  ('ad-raha',           'Al Raha Beach',            'Abu Dhabi',      24.4500, 54.5900),
  ('ad-yas',            'Yas Island',               'Abu Dhabi',      24.4900, 54.6050),
  ('ad-khalifa-city',   'Khalifa City',             'Abu Dhabi',      24.4200, 54.5800),
  ('ad-mbz',            'MBZ City',                 'Abu Dhabi',      24.3300, 54.5400),
  ('shj-majaz',         'Al Majaz & Al Qasba',      'Sharjah',        25.3250, 55.3820),
  ('shj-khan',          'Al Khan',                  'Sharjah',        25.3300, 55.3650),
  ('shj-nahda',         'Al Nahda (Sharjah)',       'Sharjah',        25.3020, 55.3730),
  ('shj-muwaileh',      'Muwaileh & University City','Sharjah',       25.3000, 55.4550),
  ('ajm-corniche',      'Ajman Corniche',           'Ajman',          25.4100, 55.4400),
  ('ajm-nuaimiya',      'Al Nuaimiya',              'Ajman',          25.3900, 55.4550),
  ('rak-marjan',        'Al Marjan Island',         'Ras Al Khaimah', 25.6700, 55.7400),
  ('rak-hamra',         'Al Hamra',                 'Ras Al Khaimah', 25.6950, 55.7800),
  ('rak-city',          'RAK City & Al Nakheel',    'Ras Al Khaimah', 25.7900, 55.9500),
  ('alain-centre',      'Al Ain Centre',            'Al Ain',         24.2200, 55.7600),
  ('alain-jimi',        'Al Jimi & Al Muwaiji',     'Al Ain',         24.2450, 55.7300)
on conflict (slug) do update set name = excluded.name, city = excluded.city, lat = excluded.lat, lng = excluded.lng;

-- The areas a room covers right now, and how wide it has gone ('nearby', 'wider' or 'city').
create or replace function area_room(p_area text)
returns table (slug text, name text, scope text)
language plpgsql stable security definer set search_path = public as $$
declare
  a areas;
  active int;
  sc text := 'nearby';
  radius double precision := 5;
begin
  select * into a from areas where areas.slug = p_area;
  if not found then return; end if;
  select count(*) into active from area_members m join areas b on b.slug = m.area
    where m.last_seen > now() - interval '24 hours' and area_km(a, b) <= 5;
  if active < 5 then
    sc := 'wider';
    radius := 15;
    select count(*) into active from area_members m join areas b on b.slug = m.area
      where m.last_seen > now() - interval '24 hours' and area_km(a, b) <= 15;
  end if;
  if active < 5 then
    sc := 'city';
  end if;
  return query
    select b.slug, b.name, sc from areas b
    where case when sc = 'city' then b.city = a.city or area_km(a, b) <= 15 else area_km(a, b) <= radius end
    order by area_km(a, b);
end;
$$;
grant execute on function area_room(text) to authenticated;

create or replace function my_area_scope()
returns table (scope text, city text, areas integer)
language sql stable security definer set search_path = public as $$
  select (select r.scope from area_room(m.area) r limit 1), a.city, (select count(*)::int from area_room(m.area))
  from area_members m join areas a on a.slug = m.area
  where m.user_id = auth.uid();
$$;
grant execute on function my_area_scope() to authenticated;

-- The feed, counts and featured venues now follow the room's current width.
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
    where p.area in (select r.slug from area_room(me.area) r)
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

create or replace function area_counts()
returns table (area text, area_name text, people bigint)
language sql stable security definer set search_path = public as $$
  select r.slug, r.name, (select count(*) from area_members m where m.area = r.slug and m.last_seen > now() - interval '2 hours')
  from area_members me cross join lateral area_room(me.area) r
  where me.user_id = auth.uid();
$$;
grant execute on function area_counts() to authenticated;

create or replace function area_venues()
returns table (id uuid, name text, slug text, area_name text, place text, has_logo boolean, brand_version bigint,
               accent text, groups_enabled boolean, here_now bigint)
language sql stable security definer set search_path = public as $$
  select v.id, v.name, v.slug, a.name, v.place, v.logo_data is not null, extract(epoch from v.brand_updated_at)::bigint,
         v.theme_accent, coalesce(v.groups_enabled, false),
         (select count(*) from visits vi where vi.venue_id = v.id and vi.ended_at is null)
  from area_members me
  cross join lateral area_room(me.area) r
  join venues v on v.area = r.slug
  join areas a on a.slug = v.area
  where me.user_id = auth.uid() and v.kind = 'venue' and venue_open(v.id)
  order by (v.area = me.area) desc, v.name
  limit 12;
$$;
grant execute on function area_venues() to authenticated;
