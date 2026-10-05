-- Serendine: group offers and replies on a plan.
--  • A venue can offer something for bigger groups ("8 or more: a free bottle of bubbly",
--    "10 or more: the organiser eats free"). Guests see the offers while planning, and the
--    offer that applies is locked onto the request so staff know what was promised.
--  • Everyone in a plan can reply on the plan page ("I'll be 20 minutes late", "Can we do 9?").
-- Needs update 0025 first.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

-- 1. Group offers ---------------------------------------------------------------------------

create table if not exists venue_group_offers (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  min_size    integer not null check (min_size between 2 and 60),
  offer       text not null check (char_length(offer) between 1 and 120),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists venue_group_offers_venue on venue_group_offers (venue_id, min_size);
alter table venue_group_offers enable row level security;   -- read and written through the functions below

alter table gatherings add column if not exists offer_text text;

-- The offer that applies to a group of this size: the biggest threshold they reach.
create or replace function group_offer_for(p_venue uuid, p_size integer)
returns text language sql stable security definer set search_path = public as $$
  select o.offer from venue_group_offers o
  where o.venue_id = p_venue and o.active and o.min_size <= p_size
  order by o.min_size desc, o.created_at limit 1;
$$;

-- Lock the offer onto each new request (so changing offers later doesn't change what was promised).
create or replace function gatherings_set_offer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.offer_text := group_offer_for(new.venue_id, new.party_size);
  return new;
end;
$$;
drop trigger if exists gatherings_offer on gatherings;
create trigger gatherings_offer before insert on gatherings for each row execute function gatherings_set_offer();

-- Managers: list, add or change, and remove offers
create or replace function venue_group_offers_list(v uuid)
returns table (id uuid, min_size integer, offer text, active boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.min_size, o.offer, o.active from venue_group_offers o
  where o.venue_id = v and is_venue_member(v)
  order by o.min_size, o.created_at;
$$;
grant execute on function venue_group_offers_list(uuid) to authenticated;

create or replace function save_group_offer(v uuid, p_id uuid, p_min_size integer, p_offer text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not can_manage_venue(v) then raise exception 'Only a manager can change group offers'; end if;
  if p_min_size is null or p_min_size < 2 or p_min_size > 60 then raise exception 'Pick a group size from 2 to 60'; end if;
  if char_length(trim(coalesce(p_offer, ''))) = 0 then raise exception 'Write the offer'; end if;
  if p_id is null then
    if (select count(*) from venue_group_offers where venue_id = v) >= 6 then raise exception 'Up to six group offers'; end if;
    insert into venue_group_offers (venue_id, min_size, offer, active)
      values (v, p_min_size, left(trim(p_offer), 120), coalesce(p_active, true))
      returning id into new_id;
    return new_id;
  end if;
  update venue_group_offers set min_size = p_min_size, offer = left(trim(p_offer), 120), active = coalesce(p_active, true)
    where id = p_id and venue_id = v;
  return p_id;
end;
$$;
grant execute on function save_group_offer(uuid, uuid, integer, text, boolean) to authenticated;

create or replace function delete_group_offer(v uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_venue(v) then raise exception 'Only a manager can change group offers'; end if;
  delete from venue_group_offers where id = p_id and venue_id = v;
end;
$$;
grant execute on function delete_group_offer(uuid, uuid) to authenticated;

-- Venues a guest can plan at, now with their group offers (public: it's a list of places)
drop function if exists bookable_venues();
create function bookable_venues()
returns table (id uuid, name text, slug text, kind text, place text, accent text, has_logo boolean, brand_version bigint,
               group_offers jsonb)
language sql stable security definer set search_path = public as $$
  select v.id, v.name, v.slug, v.kind, v.place, v.theme_accent, v.logo_data is not null,
         extract(epoch from v.brand_updated_at)::bigint,
         coalesce((select jsonb_agg(jsonb_build_object('min_size', o.min_size, 'offer', o.offer) order by o.min_size)
                   from venue_group_offers o where o.venue_id = v.id and o.active), '[]'::jsonb)
  from venues v where v.groups_enabled
  order by v.name;
$$;
grant execute on function bookable_venues() to anon, authenticated;

-- The invite page, now with the offer and the number of replies
drop function if exists gathering_by_code(text);
create function gathering_by_code(p_code text)
returns table (id uuid, code text, title text, starts_at timestamptz, party_size integer, note text, status text,
               suggested_at timestamptz, venue_note text, venue_id uuid, venue_name text, venue_slug text, place text,
               organiser_name text, going integer, i_am_organiser boolean, my_rsvp text, members jsonb, offer_text text)
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
              else '[]'::jsonb end,
         g.offer_text
  from gatherings g join venues v on v.id = g.venue_id
  where g.code = p_code;
$$;
grant execute on function gathering_by_code(text) to anon, authenticated;

-- The venue's list of requests, now with the offer that was promised
drop function if exists venue_gatherings(uuid);
create function venue_gatherings(v uuid)
returns table (id uuid, code text, title text, starts_at timestamptz, party_size integer, note text, status text,
               suggested_at timestamptz, organiser_name text, organiser_email text, going integer, created_at timestamptz,
               offer_text text)
language sql stable security definer set search_path = public as $$
  select g.id, g.code, g.title, g.starts_at, g.party_size, g.note, g.status, g.suggested_at,
         (select m.name from gathering_members m where m.gathering_id = g.id and m.user_id = g.organiser),
         (select u.email from auth.users u where u.id = g.organiser),
         (select count(*)::int from gathering_members m where m.gathering_id = g.id and m.rsvp = 'going'),
         g.created_at, g.offer_text
  from gatherings g
  where g.venue_id = v and is_venue_member(v)
    and g.starts_at > now() - interval '6 hours'
    and g.status <> 'cancelled'
  order by (g.status = 'requested') desc, g.starts_at;
$$;
grant execute on function venue_gatherings(uuid) to authenticated;

-- 2. Replies on a plan ----------------------------------------------------------------------

create table if not exists gathering_messages (
  id            uuid primary key default gen_random_uuid(),
  gathering_id  uuid not null references gatherings(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 500),
  created_at    timestamptz not null default now()
);
create index if not exists gathering_messages_plan on gathering_messages (gathering_id, created_at);
alter table gathering_messages enable row level security;   -- through the functions below

-- Only people in the plan (anyone who answered) can read and reply.
create or replace function plan_messages(p_code text)
returns table (id uuid, name text, body text, created_at timestamptz, mine boolean, is_organiser boolean)
language sql stable security definer set search_path = public as $$
  select gm.id, coalesce(m.name, 'Guest'), gm.body, gm.created_at, gm.user_id = auth.uid(), gm.user_id = g.organiser
  from gatherings g
  join gathering_messages gm on gm.gathering_id = g.id
  left join gathering_members m on m.gathering_id = g.id and m.user_id = gm.user_id
  where g.code = p_code
    and exists (select 1 from gathering_members me where me.gathering_id = g.id and me.user_id = auth.uid())
  order by gm.created_at
  limit 300;
$$;
grant execute on function plan_messages(text) to authenticated;

create or replace function post_plan_message(p_code text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g gatherings; new_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into g from gatherings where code = p_code;
  if not found then raise exception 'This plan no longer exists'; end if;
  if not exists (select 1 from gathering_members where gathering_id = g.id and user_id = auth.uid()) then
    raise exception 'Say whether you''re in first, then you can reply';
  end if;
  if exists (select 1 from banned_users where user_id = auth.uid()) then raise exception 'This account can no longer use Serendine'; end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write something first'; end if;
  if (select count(*) from gathering_messages where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 8 then
    raise exception 'Slow down a little';
  end if;
  insert into gathering_messages (gathering_id, user_id, body)
    values (g.id, auth.uid(), left(trim(p_body), 500)) returning id into new_id;
  return new_id;
end;
$$;
grant execute on function post_plan_message(text, text) to authenticated;

create or replace function delete_plan_message(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from gathering_messages gm
  where gm.id = p_id
    and (gm.user_id = auth.uid()
         or exists (select 1 from gatherings g where g.id = gm.gathering_id and g.organiser = auth.uid()));
$$;
grant execute on function delete_plan_message(uuid) to authenticated;

-- A reply → a notification to everyone else in the plan who hasn't said no (only right after posting).
create or replace function push_for_plan_message(p_id uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth,
         coalesce(sender.name, 'Someone') || ' · ' || g.title,
         left(gm.body, 140), '/g/' || g.code, 'plan-' || g.id::text
  from gathering_messages gm
  join gatherings g on g.id = gm.gathering_id
  left join gathering_members sender on sender.gathering_id = g.id and sender.user_id = gm.user_id
  join gathering_members m on m.gathering_id = g.id and m.rsvp <> 'no' and m.user_id <> gm.user_id
  join push_subscriptions ps on ps.user_id = m.user_id
  where gm.id = p_id and gm.user_id = auth.uid() and gm.created_at > now() - interval '1 minute';
$$;
grant execute on function push_for_plan_message(uuid) to authenticated;
