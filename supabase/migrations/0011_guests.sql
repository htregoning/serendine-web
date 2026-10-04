-- Serendine: the venue's Guests page.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.
--
-- Venue managers can see who checked in (name, email, when, which table) and keep notes.
-- They never see chats, who talked to whom, chat mode, gender or photos.
-- "OK to contact" shows who ticked the offers box, so marketing only goes to them.

-- Private notes a manager keeps about a regular.
create table if not exists guest_notes (
  venue_id   uuid not null references venues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  note       text not null default '' check (char_length(note) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);
alter table guest_notes enable row level security;
-- No direct access: only through the functions below.

create or replace function guest_display_name(u uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(trim(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', '')), '')
  from auth.users where id = u;
$$;
revoke execute on function guest_display_name(uuid) from public, anon, authenticated;

-- One row per guest, most recent first.
create or replace function venue_guests(v uuid)
returns table (
  user_id uuid, name text, email text, last_alias text,
  visits bigint, first_visit timestamptz, last_visit timestamptz,
  last_table text, last_zone text, ok_to_contact boolean, offers_redeemed bigint,
  drinks_bought bigint, note text
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select vi.*, t.label, t.zone from visits vi join venue_tables t on t.id = vi.table_id
    where vi.venue_id = v and can_manage_venue(v)
  ), last as (
    select distinct on (m.user_id) m.user_id, m.alias, m.label, m.zone from mine m
    order by m.user_id, m.started_at desc
  )
  select g.user_id, guest_display_name(g.user_id), u.email::text, l.alias,
         g.n, g.first_at, g.last_at, l.label, l.zone, g.ok,
         (select count(*) from offer_redemptions r join visits x on x.id = r.visit_id
            where r.venue_id = v and x.user_id = g.user_id),
         (select count(*) from drink_offers d join visits x on x.id = d.from_visit
            where d.venue_id = v and x.user_id = g.user_id and d.status in ('accepted', 'served')),
         coalesce(gn.note, '')
  from (
    select m.user_id, count(*) n, min(m.started_at) first_at, max(m.started_at) last_at,
           bool_or(m.marketing_opt_in) ok
    from mine m group by m.user_id
  ) g
  join auth.users u on u.id = g.user_id
  join last l on l.user_id = g.user_id
  left join guest_notes gn on gn.venue_id = v and gn.user_id = g.user_id
  order by g.last_at desc;
$$;
grant execute on function venue_guests(uuid) to authenticated;

-- Every visit for one guest at this venue.
create or replace function venue_guest_visits(v uuid, p_user uuid)
returns table (started_at timestamptz, ended_at timestamptz, table_label text, zone text,
               alias text, opted_in boolean, offer_redeemed boolean, drinks_bought bigint, requests bigint)
language sql stable security definer set search_path = public as $$
  select vi.started_at, vi.ended_at, t.label, t.zone, vi.alias, vi.marketing_opt_in,
         exists (select 1 from offer_redemptions r where r.visit_id = vi.id),
         (select count(*) from drink_offers d where d.from_visit = vi.id and d.status in ('accepted', 'served')),
         (select count(*) from service_requests s where s.visit_id = vi.id)
  from visits vi join venue_tables t on t.id = vi.table_id
  where vi.venue_id = v and vi.user_id = p_user and can_manage_venue(v)
  order by vi.started_at desc;
$$;
grant execute on function venue_guest_visits(uuid, uuid) to authenticated;

-- One row per visit, for the spreadsheet download.
create or replace function venue_visit_export(v uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (visited_at timestamptz, left_at timestamptz, table_label text, zone text, name text,
               email text, alias text, ok_to_contact boolean, total_visits bigint)
language sql stable security definer set search_path = public as $$
  select vi.started_at, vi.ended_at, t.label, t.zone, guest_display_name(vi.user_id), u.email::text,
         vi.alias,
         exists (select 1 from visits o where o.venue_id = v and o.user_id = vi.user_id and o.marketing_opt_in),
         (select count(*) from visits o where o.venue_id = v and o.user_id = vi.user_id)
  from visits vi
  join venue_tables t on t.id = vi.table_id
  join auth.users u on u.id = vi.user_id
  where vi.venue_id = v and can_manage_venue(v)
    and (p_from is null or vi.started_at >= p_from)
    and (p_to is null or vi.started_at < p_to)
  order by vi.started_at desc;
$$;
grant execute on function venue_visit_export(uuid, timestamptz, timestamptz) to authenticated;

-- Headline numbers for the last N days.
create or replace function venue_stats(v uuid, p_days int default 7)
returns table (check_ins bigint, guests bigint, new_guests bigint, repeat_guests bigint,
               opted_in bigint, drinks bigint, requests bigint)
language sql stable security definer set search_path = public as $$
  with w as (select now() - make_interval(days => greatest(1, least(p_days, 366))) as since),
  recent as (select vi.* from visits vi, w where vi.venue_id = v and vi.started_at >= w.since and can_manage_venue(v))
  select
    (select count(*) from recent),
    (select count(distinct user_id) from recent),
    (select count(distinct r.user_id) from recent r, w
       where not exists (select 1 from visits o where o.venue_id = v and o.user_id = r.user_id and o.started_at < w.since)),
    (select count(*) from (select r.user_id from recent r
       where (select count(*) from visits o where o.venue_id = v and o.user_id = r.user_id) > 1
       group by r.user_id) x),
    (select count(distinct user_id) from recent where marketing_opt_in),
    (select count(*) from drink_offers d, w where d.venue_id = v and d.created_at >= w.since
       and d.status in ('accepted', 'served') and can_manage_venue(v)),
    (select count(*) from service_requests s, w where s.venue_id = v and s.created_at >= w.since and can_manage_venue(v));
$$;
grant execute on function venue_stats(uuid, int) to authenticated;

create or replace function set_guest_note(v uuid, p_user uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if not exists (select 1 from visits where venue_id = v and user_id = p_user) then
    raise exception 'Not a guest of this venue';
  end if;
  insert into guest_notes (venue_id, user_id, note, updated_at)
    values (v, p_user, left(coalesce(p_note, ''), 1000), now())
  on conflict (venue_id, user_id) do update set note = excluded.note, updated_at = now();
end;
$$;
grant execute on function set_guest_note(uuid, uuid, text) to authenticated;
