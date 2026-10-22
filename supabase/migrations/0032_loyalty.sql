-- Serendine: loyalty, run by each venue.
--  • Visit rewards: "5th visit: free dessert". Counted automatically from check-ins (one per day).
--  • Stamp cards: "Buy 9 coffees, the 10th is free". Staff tap +1 for a guest at a table.
--  • When a guest reaches the target, a reward is waiting; staff tap Redeem when they give it.
--  • Each venue sees only its own schemes and stamps.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

create table if not exists loyalty_schemes (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  kind        text not null check (kind in ('visits', 'stamps')),
  name        text not null check (char_length(name) between 1 and 40),
  item        text check (item is null or char_length(item) <= 30),       -- "coffee" (stamp cards)
  target      integer not null check (target between 2 and 50),
  reward      text not null check (char_length(reward) between 1 and 80),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists loyalty_schemes_venue on loyalty_schemes (venue_id);

create table if not exists loyalty_stamps (
  id          bigint generated always as identity primary key,
  scheme_id   uuid not null references loyalty_schemes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  visit_id    uuid references visits(id) on delete set null,
  qty         integer not null default 1 check (qty between 1 and 10),
  added_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists loyalty_stamps_lookup on loyalty_stamps (scheme_id, user_id);

create table if not exists loyalty_redemptions (
  id           bigint generated always as identity primary key,
  scheme_id    uuid not null references loyalty_schemes(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  visit_id     uuid references visits(id) on delete set null,
  redeemed_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists loyalty_redemptions_lookup on loyalty_redemptions (scheme_id, user_id);

alter table loyalty_schemes enable row level security;      -- all through the functions below
alter table loyalty_stamps enable row level security;
alter table loyalty_redemptions enable row level security;

-- How far a guest has got: total counted, rewards earned so far, rewards still to collect, progress to the next.
create or replace function loyalty_count(s loyalty_schemes, u uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case s.kind
    when 'visits' then (select count(distinct (vi.started_at at time zone 'Asia/Dubai')::date)::int
                        from visits vi where vi.venue_id = s.venue_id and vi.user_id = u and vi.started_at >= s.created_at)
    else (select coalesce(sum(qty), 0)::int from loyalty_stamps st where st.scheme_id = s.id and st.user_id = u)
  end;
$$;

create or replace function loyalty_state(s loyalty_schemes, u uuid, out total int, out ready int, out progress int)
language plpgsql stable security definer set search_path = public as $$
declare used int;
begin
  total := loyalty_count(s, u);
  select count(*)::int into used from loyalty_redemptions r where r.scheme_id = s.id and r.user_id = u;
  ready := greatest(0, total / s.target - used);
  progress := total % s.target;
end;
$$;

-- Managers: the venue's schemes
create or replace function venue_loyalty_schemes(v uuid)
returns table (id uuid, kind text, name text, item text, target integer, reward text, active boolean,
               members bigint, rewards_given bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind, s.name, s.item, s.target, s.reward, s.active,
         case s.kind
           when 'visits' then (select count(distinct user_id) from visits vi where vi.venue_id = v and vi.started_at >= s.created_at)
           else (select count(distinct user_id) from loyalty_stamps st where st.scheme_id = s.id) end,
         (select count(*) from loyalty_redemptions r where r.scheme_id = s.id)
  from loyalty_schemes s
  where s.venue_id = v and is_venue_member(v)
  order by s.active desc, s.created_at;
$$;
grant execute on function venue_loyalty_schemes(uuid) to authenticated;

create or replace function save_loyalty_scheme(v uuid, p_id uuid, p_kind text, p_name text, p_item text,
                                               p_target integer, p_reward text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not can_manage_venue(v) then raise exception 'Only a manager can change loyalty schemes'; end if;
  if p_kind not in ('visits', 'stamps') then raise exception 'Choose visits or a stamp card'; end if;
  if p_target is null or p_target < 2 or p_target > 50 then raise exception 'Pick a number from 2 to 50'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give the scheme a name'; end if;
  if char_length(trim(coalesce(p_reward, ''))) = 0 then raise exception 'Say what the reward is'; end if;
  if p_kind = 'stamps' and char_length(trim(coalesce(p_item, ''))) = 0 then raise exception 'Say what earns a stamp, e.g. coffee'; end if;
  if p_id is null then
    if (select count(*) from loyalty_schemes where venue_id = v and active) >= 5 then raise exception 'Up to five schemes at a time'; end if;
    insert into loyalty_schemes (venue_id, kind, name, item, target, reward, active)
      values (v, p_kind, left(trim(p_name), 40), nullif(left(trim(coalesce(p_item, '')), 30), ''), p_target,
              left(trim(p_reward), 80), coalesce(p_active, true))
      returning id into new_id;
    return new_id;
  end if;
  -- The kind and target stay fixed once guests are collecting, so nobody's progress changes under them.
  update loyalty_schemes set name = left(trim(p_name), 40), reward = left(trim(p_reward), 80),
         item = coalesce(nullif(left(trim(coalesce(p_item, '')), 30), ''), item), active = coalesce(p_active, active)
  where id = p_id and venue_id = v;
  return p_id;
end;
$$;
grant execute on function save_loyalty_scheme(uuid, uuid, text, text, text, integer, text, boolean) to authenticated;

-- Staff: everyone checked in now, with their loyalty progress (one row per guest per active scheme).
create or replace function venue_loyalty_now(v uuid)
returns table (visit_id uuid, alias text, table_label text, zone text, scheme_id uuid, scheme text, kind text,
               item text, target integer, reward text, progress integer, ready integer)
language sql stable security definer set search_path = public as $$
  select vi.id, vi.alias, t.label, t.zone, s.id, s.name, s.kind, s.item, s.target, s.reward,
         (loyalty_state(s, vi.user_id)).progress, (loyalty_state(s, vi.user_id)).ready
  from visits vi
  join venue_tables t on t.id = vi.table_id
  join loyalty_schemes s on s.venue_id = vi.venue_id and s.active
  where vi.venue_id = v and vi.ended_at is null and is_venue_member(v)
  order by t.label, vi.alias, s.created_at;
$$;
grant execute on function venue_loyalty_now(uuid) to authenticated;

create or replace function add_loyalty_stamp(p_scheme uuid, p_visit uuid, p_qty integer default 1)
returns table (progress integer, ready integer)
language plpgsql security definer set search_path = public as $$
declare s loyalty_schemes; vi visits;
begin
  select * into s from loyalty_schemes where id = p_scheme and active;
  if not found then raise exception 'That loyalty card is no longer running'; end if;
  if not is_venue_member(s.venue_id) then raise exception 'Not allowed'; end if;
  if s.kind <> 'stamps' then raise exception 'Visits are counted automatically'; end if;
  select * into vi from visits where id = p_visit and venue_id = s.venue_id and ended_at is null;
  if not found then raise exception 'That guest is no longer checked in'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then raise exception 'Add 1 to 10 at a time'; end if;
  insert into loyalty_stamps (scheme_id, user_id, visit_id, qty, added_by) values (s.id, vi.user_id, vi.id, p_qty, auth.uid());
  return query select (loyalty_state(s, vi.user_id)).progress, (loyalty_state(s, vi.user_id)).ready;
end;
$$;
grant execute on function add_loyalty_stamp(uuid, uuid, integer) to authenticated;

-- Staff: take back the last stamp added for this guest (a mis-tap), within 10 minutes.
create or replace function undo_loyalty_stamp(p_scheme uuid, p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s loyalty_schemes; last_id bigint;
begin
  select * into s from loyalty_schemes where id = p_scheme;
  if not found or not is_venue_member(s.venue_id) then raise exception 'Not allowed'; end if;
  select id into last_id from loyalty_stamps
    where scheme_id = p_scheme and visit_id = p_visit and created_at > now() - interval '10 minutes'
    order by id desc limit 1;
  if last_id is null then raise exception 'Nothing recent to undo'; end if;
  delete from loyalty_stamps where id = last_id;
end;
$$;
grant execute on function undo_loyalty_stamp(uuid, uuid) to authenticated;

create or replace function redeem_loyalty(p_scheme uuid, p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s loyalty_schemes; vi visits;
begin
  select * into s from loyalty_schemes where id = p_scheme;
  if not found or not is_venue_member(s.venue_id) then raise exception 'Not allowed'; end if;
  select * into vi from visits where id = p_visit and venue_id = s.venue_id;
  if not found then raise exception 'That guest is no longer checked in'; end if;
  if (loyalty_state(s, vi.user_id)).ready < 1 then raise exception 'No reward ready yet'; end if;
  insert into loyalty_redemptions (scheme_id, user_id, visit_id, redeemed_by) values (s.id, vi.user_id, vi.id, auth.uid());
end;
$$;
grant execute on function redeem_loyalty(uuid, uuid) to authenticated;

-- Guests: my cards at one venue (in the room) or everywhere (my page).
create or replace function my_loyalty(v uuid default null)
returns table (venue_id uuid, venue_name text, scheme_id uuid, scheme text, kind text, item text, target integer,
               reward text, progress integer, ready integer)
language sql stable security definer set search_path = public as $$
  select s.venue_id, ve.name, s.id, s.name, s.kind, s.item, s.target, s.reward,
         (loyalty_state(s, auth.uid())).progress, (loyalty_state(s, auth.uid())).ready
  from loyalty_schemes s join venues ve on ve.id = s.venue_id
  where s.active and (v is null or s.venue_id = v)
    and auth.uid() is not null
    and exists (select 1 from visits vi where vi.venue_id = s.venue_id and vi.user_id = auth.uid())
  order by ve.name, s.created_at;
$$;
grant execute on function my_loyalty(uuid) to authenticated;
