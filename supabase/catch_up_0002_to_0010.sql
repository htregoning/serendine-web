-- Serendine: catch-up update (everything from 0002 to 0010 except 0007).
-- For a database that already has 0001 and 0007. Safe to run more than once.
-- Paste into Supabase › SQL Editor › New query, then Run.

-- ===========================================================================
-- 0002: staff screen
-- ===========================================================================
-- Guests at the venue right now who opted in to offers, so staff can redeem
-- the welcome offer. Only venue members (staff or managers) get results.
create or replace function staff_offer_guests(v uuid)
returns table (visit_id uuid, table_label text, alias text, redeemed boolean, code text)
language sql stable security definer set search_path = public as $$
  select vi.id, t.label, vi.alias, r.id is not null, r.code
  from visits vi
  join venue_tables t on t.id = vi.table_id
  left join offer_redemptions r on r.visit_id = vi.id
  where vi.venue_id = v
    and vi.ended_at is null
    and vi.marketing_opt_in
    and is_venue_member(v)
  order by t.label;
$$;
grant execute on function staff_offer_guests(uuid) to authenticated;

-- Keep updated_at honest when staff change a request's status.
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists service_requests_touch on service_requests;
create trigger service_requests_touch before update on service_requests
  for each row execute function touch_updated_at();

-- Live updates for redemptions, so the guest's offer card flips to "Redeemed".
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'offer_redemptions') then
    alter publication supabase_realtime add table offer_redemptions;
  end if;
end $$;

-- ===========================================================================
-- 0003: chat between tables
-- ===========================================================================
-- Guests no longer update conversations directly: each person may only set
-- their own "share table" and "keep in touch" choices, through set_conversation_flag.
drop policy if exists conv_update on conversations;
drop policy if exists conv_create on conversations;

-- Open the chat with another guest, creating it if needed.
create or replace function start_conversation(theirs uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  mine visits;
  c uuid;
begin
  select * into mine from visits where user_id = auth.uid() and ended_at is null;
  if not found then raise exception 'You are not checked in'; end if;
  select id into c from conversations
    where (visit_a = mine.id and visit_b = theirs) or (visit_a = theirs and visit_b = mine.id);
  if c is not null then return c; end if;
  if not can_start_conversation(mine.venue_id, mine.id, theirs) then
    raise exception 'This person is not available to chat';
  end if;
  insert into conversations (venue_id, visit_a, visit_b) values (mine.venue_id, mine.id, theirs)
    returning id into c;
  return c;
end;
$$;
grant execute on function start_conversation(uuid) to authenticated;

-- Set your own side of "share table" or "keep in touch".
create or replace function set_conversation_flag(c uuid, flag text, val boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  conv conversations;
  mine uuid;
begin
  select * into conv from conversations where id = c;
  if not found then raise exception 'Chat not found'; end if;
  select id into mine from visits
    where user_id = auth.uid() and id in (conv.visit_a, conv.visit_b);
  if mine is null then raise exception 'Not allowed'; end if;
  if flag = 'share' then
    if mine = conv.visit_a then update conversations set a_shares_table = val where id = c;
    else update conversations set b_shares_table = val where id = c; end if;
  elsif flag = 'keep' then
    if mine = conv.visit_a then update conversations set a_keeps = val where id = c;
    else update conversations set b_keeps = val where id = c; end if;
  else
    raise exception 'Unknown option';
  end if;
end;
$$;
grant execute on function set_conversation_flag(uuid, text, boolean) to authenticated;

-- Ignore & block the other person (optionally reporting them). The chat is removed
-- for both; a report keeps the messages the reporter chose to submit.
create or replace function block_partner(c uuid, p_report boolean default false,
                                         p_reason text default null, p_evidence jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  conv conversations;
  me_user uuid := auth.uid();
  them uuid;
begin
  select * into conv from conversations where id = c;
  if not found then raise exception 'Chat not found'; end if;
  select v.user_id into them from visits v
    where v.id in (conv.visit_a, conv.visit_b) and v.user_id <> me_user;
  if them is null or not exists (
    select 1 from visits v where v.id in (conv.visit_a, conv.visit_b) and v.user_id = me_user
  ) then raise exception 'Not allowed'; end if;

  insert into blocks (blocker_user, blocked_user) values (me_user, them) on conflict do nothing;
  if p_report then
    insert into reports (reporter_user, reported_user, conversation_id, reason, evidence)
      values (me_user, them, null, left(p_reason, 500), p_evidence);
  end if;
  delete from connections where user_a = least(me_user, them) and user_b = greatest(me_user, them);
  delete from conversations where id = c;
end;
$$;
grant execute on function block_partner(uuid, boolean, text, jsonb) to authenticated;

-- ===========================================================================
-- 0004: check-out and edit rights
-- ===========================================================================
-- 2. Guests may only change these parts of their own visit.
revoke update on visits from anon, authenticated;
grant update (is_open, public_key) on visits to authenticated;

-- 3. Service requests: only the status can change (guest cancels, staff progress it).
revoke update on service_requests from anon, authenticated;
grant update (status) on service_requests to authenticated;

-- Automatic check-out every 15 minutes (uses the newer check-out from 0007).
-- If the scheduler can't be switched on here, everything else still installs.
do $$
begin
  execute 'create extension if not exists pg_cron';
  execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'serendine-expire-visits'$q$;
  execute $q$select cron.schedule('serendine-expire-visits', '*/15 * * * *', 'select public.expire_stale_visits()')$q$;
exception when others then
  raise notice 'Automatic check-out not scheduled: %', sqlerrm;
end $$;

-- ===========================================================================
-- 0005: connections
-- ===========================================================================
-- People you both chose to keep in touch with, newest activity first.
create or replace function my_connections()
returns table (
  conversation_id uuid, my_visit uuid, partner_visit uuid, partner_alias text,
  partner_mode chat_mode, partner_key text, venue_name text, met_at timestamptz, last_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id, me.id, p.id, p.alias, p.mode, p.public_key, v.name, cn.met_at,
    coalesce((select max(m.created_at) from messages m where m.conversation_id = c.id), c.created_at)
  from connections cn
  join conversations c on c.id = cn.conversation_id
  join visits me on me.id in (c.visit_a, c.visit_b) and me.user_id = auth.uid()
  join visits p on p.id in (c.visit_a, c.visit_b) and p.id <> me.id
  join venues v on v.id = c.venue_id
  where auth.uid() in (cn.user_a, cn.user_b)
    and not is_blocked_between(me.user_id, p.user_id)
  order by 9 desc;
$$;
grant execute on function my_connections() to authenticated;

-- Remove a connection: the chat is deleted for both people (no block, no report).
create or replace function remove_connection(c uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from connections
  where conversation_id = c and auth.uid() in (user_a, user_b);
  if found then
    delete from conversations where id = c;
  end if;
end;
$$;
grant execute on function remove_connection(uuid) to authenticated;

-- ===========================================================================
-- 0006: push notifications
-- ===========================================================================
-- Each phone or browser that turned notifications on.
create table if not exists push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists push_own_read on push_subscriptions;
create policy push_own_read on push_subscriptions for select using (user_id = auth.uid());
drop policy if exists push_own_delete on push_subscriptions;
create policy push_own_delete on push_subscriptions for delete using (user_id = auth.uid());

-- Save this device for the signed-in person (a shared device moves to them).
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;
grant execute on function save_push_subscription(text, text, text) to authenticated;

-- Remove a device the push service says no longer exists.
create or replace function prune_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;
grant execute on function prune_push_subscription(text) to authenticated;

-- The QR token of the signed-in guest's current table (to reopen their room).
create or replace function my_active_table_token()
returns text language sql stable security definer set search_path = public as $$
  select t.qr_token from visits v join venue_tables t on t.id = v.table_id
  where v.user_id = auth.uid() and v.ended_at is null
  limit 1;
$$;
grant execute on function my_active_table_token() to authenticated;

-- Who to notify, and what to say. Each only works for the person who just did
-- the thing (in the last minute), so nobody can use it to spam others.
-- Message text is never included: it is end-to-end encrypted.

-- A new chat message: notify the other person.
create or replace function push_for_message(c uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth,
         'Serendine'::text,
         'New message from ' || me.alias,
         case when them.ended_at is null then '/t/' || tt.qr_token || '/room' else '/connections' end,
         'chat-' || c::text
  from conversations conv
  join visits me   on me.id in (conv.visit_a, conv.visit_b) and me.user_id = auth.uid()
  join visits them on them.id in (conv.visit_a, conv.visit_b) and them.id <> me.id
  join venue_tables tt on tt.id = them.table_id
  join push_subscriptions ps on ps.user_id = them.user_id
  where conv.id = c
    and exists (select 1 from messages m where m.conversation_id = c and m.sender_visit = me.id
                and m.created_at > now() - interval '1 minute')
    and not is_blocked_between(me.user_id, them.user_id);
$$;
grant execute on function push_for_message(uuid) to authenticated;

-- Staff tapped "On my way": notify the guest.
create or replace function push_for_request_update(r uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth,
         v.name,
         case sr.kind when 'bill' then 'Your bill is on its way'
                      when 'water' then 'Water is on its way'
                      else 'Someone is on the way to your table' end,
         '/t/' || t.qr_token || '/room',
         'request-' || r::text
  from service_requests sr
  join venues v on v.id = sr.venue_id
  join venue_tables t on t.id = sr.table_id
  join visits vi on vi.id = sr.visit_id
  join push_subscriptions ps on ps.user_id = vi.user_id
  where sr.id = r
    and sr.status = 'seen'
    and sr.updated_at > now() - interval '1 minute'
    and is_venue_member(sr.venue_id);
$$;
grant execute on function push_for_request_update(uuid) to authenticated;

-- A guest asked for something: notify the venue's staff and managers.
create or replace function push_for_new_request(r uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth,
         'Table ' || t.label,
         case sr.kind when 'bill' then 'Bring the bill'
                      when 'water' then 'Water please'
                      else 'Call a waiter' end,
         '/staff?v=' || v.slug,
         'staff-' || r::text
  from service_requests sr
  join venues v on v.id = sr.venue_id
  join venue_tables t on t.id = sr.table_id
  join visits vi on vi.id = sr.visit_id
  join venue_members vm on vm.venue_id = sr.venue_id
  join push_subscriptions ps on ps.user_id = vm.user_id
  where sr.id = r
    and vi.user_id = auth.uid()
    and sr.created_at > now() - interval '1 minute';
$$;
grant execute on function push_for_new_request(uuid) to authenticated;

-- ===========================================================================
-- 0008: send a drink
-- ===========================================================================
alter table venues add column if not exists drinks_enabled boolean not null default true;

create table if not exists drink_offers (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  from_visit uuid not null references visits(id) on delete cascade,
  to_visit   uuid not null references visits(id) on delete cascade,
  note       text check (char_length(note) <= 80),
  status     text not null default 'offered'
             check (status in ('offered', 'accepted', 'declined', 'served', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_visit <> to_visit)
);
create index if not exists drink_offers_venue on drink_offers (venue_id, status);
alter table drink_offers enable row level security;

-- Readable by the two guests involved and by the venue's staff (needed for live updates).
drop policy if exists drinks_read on drink_offers;
create policy drinks_read on drink_offers for select using (
  exists (select 1 from visits v where v.id in (from_visit, to_visit) and v.user_id = auth.uid())
  or is_venue_member(venue_id)
);
-- All changes go through the functions below.

drop trigger if exists drink_offers_touch on drink_offers;
create trigger drink_offers_touch before update on drink_offers
  for each row execute function touch_updated_at();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'drink_offers') then
    alter publication supabase_realtime add table drink_offers;
  end if;
end $$;

-- Offer a drink to someone open in the room.
create or replace function offer_drink(p_to uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me visits; them visits; new_id uuid;
begin
  select * into me from visits where user_id = auth.uid() and ended_at is null;
  if not found or not me.is_open then raise exception 'Switch on Open to chat first'; end if;
  select * into them from visits where id = p_to;
  if not found or them.ended_at is not null or not them.is_open or them.venue_id <> me.venue_id
     or them.user_id = me.user_id or is_blocked_between(me.user_id, them.user_id) then
    raise exception 'This person is not available';
  end if;
  if not (select drinks_enabled from venues where id = me.venue_id) then
    raise exception 'This venue has switched off sending drinks';
  end if;
  if exists (select 1 from drink_offers where from_visit = me.id and to_visit = them.id and status = 'offered') then
    raise exception 'You already offered them a drink';
  end if;
  if (select count(*) from drink_offers where from_visit = me.id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'That''s plenty of drinks for now';
  end if;
  insert into drink_offers (venue_id, from_visit, to_visit, note)
    values (me.venue_id, me.id, them.id, nullif(left(trim(coalesce(p_note, '')), 80), ''))
    returning id into new_id;
  return new_id;
end;
$$;
grant execute on function offer_drink(uuid, text) to authenticated;

-- Accept or decline a drink offered to you.
create or replace function respond_drink(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update drink_offers d set status = case when p_accept then 'accepted' else 'declined' end
  where d.id = p_id and d.status = 'offered'
    and exists (select 1 from visits v where v.id = d.to_visit and v.user_id = auth.uid() and v.ended_at is null);
  if not found then raise exception 'This offer is no longer open'; end if;
end;
$$;
grant execute on function respond_drink(uuid, boolean) to authenticated;

-- Withdraw a drink you offered (before it is accepted).
create or replace function cancel_drink(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update drink_offers d set status = 'cancelled'
  where d.id = p_id and d.status = 'offered'
    and exists (select 1 from visits v where v.id = d.from_visit and v.user_id = auth.uid());
end;
$$;
grant execute on function cancel_drink(uuid) to authenticated;

-- Drinks to and from me tonight. The other person's table is never shown.
create or replace function my_drinks()
returns table (id uuid, incoming boolean, other_visit uuid, other_alias text, other_gender text,
               other_has_photo boolean, note text, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.to_visit = me.id, o.id, o.alias, o.gender,
         exists (select 1 from visit_photos ph where ph.visit_id = o.id),
         d.note, d.status, d.created_at
  from drink_offers d
  join visits me on me.id in (d.from_visit, d.to_visit) and me.user_id = auth.uid() and me.ended_at is null
  join visits o on o.id in (d.from_visit, d.to_visit) and o.id <> me.id
  where not is_blocked_between(me.user_id, o.user_id)
    and not (d.status in ('declined', 'cancelled') and d.updated_at < now() - interval '10 minutes')
  order by d.created_at desc;
$$;
grant execute on function my_drinks() to authenticated;

-- Staff: accepted drinks waiting to be served.
create or replace function staff_drinks(v uuid)
returns table (id uuid, from_table text, from_alias text, to_table text, to_alias text,
               note text, accepted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, ft.label, f.alias, tt.label, t.alias, d.note, d.updated_at
  from drink_offers d
  join visits f on f.id = d.from_visit
  join visits t on t.id = d.to_visit
  join venue_tables ft on ft.id = f.table_id
  join venue_tables tt on tt.id = t.table_id
  where d.venue_id = v and d.status = 'accepted' and is_venue_member(v)
  order by d.updated_at;
$$;
grant execute on function staff_drinks(uuid) to authenticated;

create or replace function serve_drink(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update drink_offers d set status = 'served'
  where d.id = p_id and d.status = 'accepted' and is_venue_member(d.venue_id);
end;
$$;
grant execute on function serve_drink(uuid) to authenticated;

-- Push: who to tell, right after the person acted.
--  * just offered  -> the recipient: "Tony would like to buy you a drink"
--  * just accepted -> the sender, and the venue's staff
create or replace function push_for_drink(p_id uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  -- offered: tell the recipient
  select ps.endpoint, ps.p256dh, ps.auth, 'Serendine'::text,
         f.alias || ' would like to buy you a drink',
         '/t/' || tt.qr_token || '/room', 'drink-' || d.id::text
  from drink_offers d
  join visits f on f.id = d.from_visit
  join visits t on t.id = d.to_visit
  join venue_tables tt on tt.id = t.table_id
  join push_subscriptions ps on ps.user_id = t.user_id
  where d.id = p_id and d.status = 'offered' and f.user_id = auth.uid()
    and d.created_at > now() - interval '1 minute'
  union all
  -- accepted: tell the sender
  select ps.endpoint, ps.p256dh, ps.auth, 'Serendine'::text,
         t.alias || ' accepted your drink',
         '/t/' || ft.qr_token || '/room', 'drink-' || d.id::text
  from drink_offers d
  join visits f on f.id = d.from_visit
  join visits t on t.id = d.to_visit
  join venue_tables ft on ft.id = f.table_id
  join push_subscriptions ps on ps.user_id = f.user_id
  where d.id = p_id and d.status = 'accepted' and t.user_id = auth.uid()
    and d.updated_at > now() - interval '1 minute'
  union all
  -- accepted: tell the staff
  select ps.endpoint, ps.p256dh, ps.auth, 'Drink to send'::text,
         'Table ' || ft.label || ' → Table ' || tt.label || coalesce(' · ' || d.note, ''),
         '/staff?v=' || ve.slug, 'drink-staff-' || d.id::text
  from drink_offers d
  join visits f on f.id = d.from_visit
  join visits t on t.id = d.to_visit
  join venue_tables ft on ft.id = f.table_id
  join venue_tables tt on tt.id = t.table_id
  join venues ve on ve.id = d.venue_id
  join venue_members vm on vm.venue_id = d.venue_id
  join push_subscriptions ps on ps.user_id = vm.user_id
  where d.id = p_id and d.status = 'accepted' and t.user_id = auth.uid()
    and d.updated_at > now() - interval '1 minute';
$$;
grant execute on function push_for_drink(uuid) to authenticated;

-- The venue's public info now includes whether drinks are on.
drop function if exists resolve_table(text);
create or replace function resolve_table(token text)
returns table (venue_id uuid, venue_slug text, venue_name text, accent text,
               offer_enabled boolean, offer_text text, table_id uuid, table_label text,
               drinks_enabled boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.slug, v.name, v.accent, v.offer_enabled, v.offer_text, t.id, t.label, v.drinks_enabled
  from venue_tables t join venues v on v.id = t.venue_id
  where t.qr_token = token;
$$;
grant execute on function resolve_table(text) to anon, authenticated;

-- ===========================================================================
-- 0009: admin dashboard
-- ===========================================================================
-- ---------------------------------------------------------------------------
-- Who is a Serendine admin, who is banned, and pending team invites
-- ---------------------------------------------------------------------------
create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;

create table if not exists banned_users (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  reason    text,
  banned_by uuid references auth.users(id) on delete set null,
  banned_at timestamptz not null default now()
);
alter table banned_users enable row level security;

create table if not exists venue_invites (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  email      text not null check (email = lower(email) and email like '%@%'),
  role       member_role not null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (venue_id, email)
);
alter table venue_invites enable row level security;

create or replace function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;
grant execute on function is_platform_admin() to authenticated;

create or replace function can_manage_venue(v uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_platform_admin() or is_venue_member(v, 'manager');
$$;
grant execute on function can_manage_venue(uuid) to authenticated;

-- Banned accounts can't check in.
create or replace function start_visit(token text, p_alias text, p_mode chat_mode,
                                       p_opt_in boolean, p_public_key text,
                                       p_gender text default 'unspecified')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t venue_tables;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from banned_users where user_id = auth.uid()) then
    raise exception 'This account can no longer use Serendine';
  end if;
  if p_gender not in ('male', 'female', 'unspecified') then raise exception 'bad gender'; end if;
  select * into t from venue_tables where qr_token = token;
  if not found then raise exception 'unknown table'; end if;
  perform end_visit(id) from visits where user_id = auth.uid() and ended_at is null;
  insert into visits (user_id, venue_id, table_id, alias, mode, marketing_opt_in, opt_in_at, public_key, gender)
    values (auth.uid(), t.venue_id, t.id, trim(p_alias), p_mode, p_opt_in,
            case when p_opt_in then now() end, p_public_key, p_gender)
    returning id into new_id;
  return new_id;
end;
$$;
grant execute on function start_visit(text, text, chat_mode, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------
create or replace function admin_venues()
returns table (id uuid, slug text, name text, tables integer, team integer, guests_now integer,
               my_role text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select v.id, v.slug, v.name,
         (select count(*)::int from venue_tables t where t.venue_id = v.id),
         (select count(*)::int from venue_members m where m.venue_id = v.id),
         (select count(*)::int from visits vi where vi.venue_id = v.id and vi.ended_at is null),
         case when is_platform_admin() then 'admin'
              else (select m.role::text from venue_members m where m.venue_id = v.id and m.user_id = auth.uid()) end,
         v.created_at
  from venues v
  where is_platform_admin() or is_venue_member(v.id, 'manager')
  order by v.created_at desc;
$$;
grant execute on function admin_venues() to authenticated;

create or replace function admin_create_venue(p_name text, p_slug text, p_tables integer, p_zone text default 'Main room')
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not is_platform_admin() then raise exception 'Only the Serendine admin can add restaurants'; end if;
  if p_slug !~ '^[a-z0-9-]{2,60}$' then raise exception 'Web name must be 2–60 lower-case letters, numbers or dashes'; end if;
  if exists (select 1 from venues where slug = p_slug) then raise exception 'That web name is already taken'; end if;
  if p_tables < 1 or p_tables > 200 then raise exception 'Tables must be between 1 and 200'; end if;
  insert into venues (slug, name) values (p_slug, trim(p_name)) returning id into v;
  insert into venue_tables (venue_id, label, zone)
    select v, n::text, coalesce(nullif(trim(p_zone), ''), 'Main room') from generate_series(1, p_tables) n;
  return v;
end;
$$;
grant execute on function admin_create_venue(text, text, integer, text) to authenticated;

create or replace function admin_rename_venue(v uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  update venues set name = trim(p_name) where id = v;
end;
$$;
grant execute on function admin_rename_venue(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create or replace function admin_tables(v uuid)
returns table (id uuid, label text, zone text, qr_token text, guests_now integer)
language sql stable security definer set search_path = public as $$
  select t.id, t.label, t.zone, t.qr_token,
         (select count(*)::int from visits vi where vi.table_id = t.id and vi.ended_at is null)
  from venue_tables t
  where t.venue_id = v and can_manage_venue(v)
  order by (case when t.label ~ '^[0-9]+$' then lpad(t.label, 6, '0') else t.label end);
$$;
grant execute on function admin_tables(uuid) to authenticated;

create or replace function admin_add_tables(v uuid, p_count integer, p_zone text default 'Main room')
returns void language plpgsql security definer set search_path = public as $$
declare start_at integer;
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if p_count < 1 or p_count > 100 then raise exception 'Add between 1 and 100 tables at a time'; end if;
  select coalesce(max(case when label ~ '^[0-9]{1,6}$' then label::int end), 0) + 1 into start_at
    from venue_tables where venue_id = v;
  insert into venue_tables (venue_id, label, zone)
    select v, n::text, coalesce(nullif(trim(p_zone), ''), 'Main room')
    from generate_series(start_at, start_at + p_count - 1) n;
end;
$$;
grant execute on function admin_add_tables(uuid, integer, text) to authenticated;

create or replace function admin_update_table(p_table uuid, p_label text, p_zone text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select venue_id into v from venue_tables where id = p_table;
  if v is null or not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if exists (select 1 from venue_tables where venue_id = v and label = trim(p_label) and id <> p_table) then
    raise exception 'Another table already has that number';
  end if;
  update venue_tables set label = trim(p_label), zone = coalesce(nullif(trim(p_zone), ''), 'Main room')
  where id = p_table;
end;
$$;
grant execute on function admin_update_table(uuid, text, text) to authenticated;

create or replace function admin_delete_table(p_table uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select venue_id into v from venue_tables where id = p_table;
  if v is null or not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if exists (select 1 from visits where table_id = p_table and ended_at is null) then
    raise exception 'Someone is checked in at that table right now';
  end if;
  delete from venue_tables where id = p_table;
end;
$$;
grant execute on function admin_delete_table(uuid) to authenticated;

-- A fresh QR code for a table (e.g. a sticker was taken). The old sticker stops working.
create or replace function admin_new_qr(p_table uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select venue_id into v from venue_tables where id = p_table;
  if v is null or not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  update venue_tables set qr_token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) where id = p_table;
end;
$$;
grant execute on function admin_new_qr(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Team: managers and staff, invited by email
-- ---------------------------------------------------------------------------
create or replace function admin_team(v uuid)
returns table (user_id uuid, invite_id uuid, email text, role text, pending boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, null::uuid, u.email::text, m.role::text, false
  from venue_members m join auth.users u on u.id = m.user_id
  where m.venue_id = v and can_manage_venue(v)
  union all
  select null, i.id, i.email, i.role::text, true
  from venue_invites i
  where i.venue_id = v and can_manage_venue(v)
  order by 5, 4, 3;
$$;
grant execute on function admin_team(uuid) to authenticated;

-- Add someone by email. If they've signed in to Serendine before, they're added at
-- once; otherwise the invite waits until they first sign in.
create or replace function admin_invite(v uuid, p_email text, p_role member_role)
returns text language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); u uuid;
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email address doesn''t look right'; end if;
  select id into u from auth.users where lower(email) = e;
  if u is not null then
    insert into venue_members (venue_id, user_id, role) values (v, u, p_role)
      on conflict (venue_id, user_id) do update set role = excluded.role;
    delete from venue_invites where venue_id = v and email = e;
    return 'added';
  end if;
  insert into venue_invites (venue_id, email, role, invited_by) values (v, e, p_role, auth.uid())
    on conflict (venue_id, email) do update set role = excluded.role;
  return 'invited';
end;
$$;
grant execute on function admin_invite(uuid, text, member_role) to authenticated;

create or replace function admin_remove_member(v uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if p_user = auth.uid() and not is_platform_admin() then raise exception 'You can''t remove yourself'; end if;
  delete from venue_members where venue_id = v and user_id = p_user;
end;
$$;
grant execute on function admin_remove_member(uuid, uuid) to authenticated;

create or replace function admin_cancel_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select venue_id into v from venue_invites where id = p_invite;
  if v is null or not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  delete from venue_invites where id = p_invite;
end;
$$;
grant execute on function admin_cancel_invite(uuid) to authenticated;

-- Called when someone opens the staff or admin pages: accept any invites for their email.
create or replace function claim_my_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare e text; n integer;
begin
  select lower(email) into e from auth.users where id = auth.uid();
  if e is null then return 0; end if;
  insert into venue_members (venue_id, user_id, role)
    select venue_id, auth.uid(), role from venue_invites where email = e
    on conflict (venue_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from venue_invites where email = e;
  return n;
end;
$$;
grant execute on function claim_my_invites() to authenticated;

-- ---------------------------------------------------------------------------
-- Reports and bans (Serendine admin only)
-- ---------------------------------------------------------------------------
create or replace function admin_reports(p_open_only boolean default true)
returns table (id uuid, created_at timestamptz, reason text, evidence jsonb,
               reporter_email text, reported_user uuid, reported_email text,
               reports_against integer, banned boolean, resolved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.created_at, r.reason, r.evidence,
         ru.email::text, r.reported_user, tu.email::text,
         (select count(*)::int from reports r2 where r2.reported_user = r.reported_user),
         exists (select 1 from banned_users b where b.user_id = r.reported_user),
         r.resolved_at
  from reports r
  left join auth.users ru on ru.id = r.reporter_user
  left join auth.users tu on tu.id = r.reported_user
  where is_platform_admin() and (not p_open_only or r.resolved_at is null)
  order by r.created_at desc
  limit 200;
$$;
grant execute on function admin_reports(boolean) to authenticated;

create or replace function admin_resolve_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Not allowed'; end if;
  update reports set resolved_at = now() where id = p_id;
end;
$$;
grant execute on function admin_resolve_report(uuid) to authenticated;

create or replace function admin_ban(p_user uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Not allowed'; end if;
  if p_user = auth.uid() then raise exception 'You can''t ban yourself'; end if;
  insert into banned_users (user_id, reason, banned_by) values (p_user, p_reason, auth.uid())
    on conflict (user_id) do update set reason = excluded.reason, banned_at = now();
  update visits set ended_at = now(), is_open = false where user_id = p_user and ended_at is null;
  delete from visit_photos ph using visits v where v.id = ph.visit_id and v.user_id = p_user;
  update reports set resolved_at = now() where reported_user = p_user and resolved_at is null;
end;
$$;
grant execute on function admin_ban(uuid, text) to authenticated;

create or replace function admin_unban(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Not allowed'; end if;
  delete from banned_users where user_id = p_user;
end;
$$;
grant execute on function admin_unban(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Make yourself the Serendine admin (runs once; uses your sign-in email):
-- ---------------------------------------------------------------------------
insert into platform_admins (user_id)
select id from auth.users where lower(email) = 'harrytregoning@gmail.com'
on conflict do nothing;

-- ===========================================================================
-- 0010: branded stickers and test notification
-- ===========================================================================
-- ---------------------------------------------------------------------------
-- Sticker design, per venue
-- ---------------------------------------------------------------------------
alter table venues add column if not exists sticker_bg text not null default '#F7F6FF'
  check (sticker_bg ~ '^#[0-9A-Fa-f]{6}$');
alter table venues add column if not exists sticker_fg text not null default '#0B1A3A'
  check (sticker_fg ~ '^#[0-9A-Fa-f]{6}$');
alter table venues add column if not exists sticker_accent text not null default '#FF2E93'
  check (sticker_accent ~ '^#[0-9A-Fa-f]{6}$');
alter table venues add column if not exists sticker_headline text not null
  default 'Scan to say hello to another table' check (char_length(sticker_headline) <= 60);
alter table venues add column if not exists sticker_sub text not null
  default 'Call a waiter, ask for the bill, see the menu. Stay anonymous until you both agree.'
  check (char_length(sticker_sub) <= 140);
alter table venues add column if not exists logo_data text
  check (logo_data is null or (logo_data ~ '^data:image/(png|jpeg|webp);base64,' and char_length(logo_data) <= 300000));

create or replace function venue_sticker(v uuid)
returns table (bg text, fg text, accent text, headline text, sub text, logo text)
language sql stable security definer set search_path = public as $$
  select sticker_bg, sticker_fg, sticker_accent, sticker_headline, sticker_sub, logo_data
  from venues where id = v and can_manage_venue(v);
$$;
grant execute on function venue_sticker(uuid) to authenticated;

create or replace function admin_update_sticker(v uuid, p_bg text, p_fg text, p_accent text,
                                                p_headline text, p_sub text, p_logo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  update venues set
    sticker_bg = upper(p_bg), sticker_fg = upper(p_fg), sticker_accent = upper(p_accent),
    sticker_headline = left(trim(p_headline), 60), sticker_sub = left(trim(p_sub), 140),
    logo_data = nullif(p_logo, '')
  where id = v;
end;
$$;
grant execute on function admin_update_sticker(uuid, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- "Send test notification": notify your own devices
-- ---------------------------------------------------------------------------
create or replace function push_for_test(r uuid default null)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth, 'Serendine'::text,
         'Notifications are working. You''ll hear from us when someone says hello.'::text,
         '/'::text, 'test'::text
  from push_subscriptions ps
  where ps.user_id = auth.uid();
$$;
grant execute on function push_for_test(uuid) to authenticated;
