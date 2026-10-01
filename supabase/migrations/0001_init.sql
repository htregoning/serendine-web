-- Serendine: initial database schema
-- Paste this into Supabase › SQL Editor › New query, then Run.
--
-- Design rules this schema enforces:
--   * Guests are invisible until they switch on "Open to chat" for a visit.
--   * Message contents are end-to-end encrypted in the browser; the database
--     only stores ciphertext. Venue staff and managers can never read chats.
--   * Table numbers are revealed to another guest only when both agree.
--   * Venue managers (the "master user") control settings; staff accounts
--     only see service requests and offer redemptions.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type chat_mode as enum ('friendly', 'networking', 'dating');
create type member_role as enum ('manager', 'staff');
create type request_kind as enum ('waiter', 'bill', 'water');
create type request_status as enum ('sent', 'seen', 'done', 'cancelled');

-- ---------------------------------------------------------------------------
-- Venues and tables
-- ---------------------------------------------------------------------------
create table venues (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name          text not null check (char_length(name) between 1 and 80),
  accent        text not null default '#E9A23B' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  offer_enabled boolean not null default true,
  offer_text    text not null default '20% off your next drink' check (char_length(offer_text) <= 80),
  menu_pdf_path text,             -- path in the "menus" storage bucket
  menu_updated_at timestamptz,
  created_at    timestamptz not null default now()
);

create table venue_tables (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 20),  -- e.g. "12"
  zone       text not null default 'Main room' check (char_length(zone) <= 40), -- e.g. "Terrace"
  qr_token   text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_at timestamptz not null default now(),
  unique (venue_id, label)
);

-- Who runs each venue. One or more managers ("master users") and staff screens.
create table venue_members (
  venue_id   uuid not null references venues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       member_role not null,
  created_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Guests
-- ---------------------------------------------------------------------------
create table profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  confirmed_adult boolean not null default false,
  created_at      timestamptz not null default now()
);

-- One row per guest per evening at a venue.
create table visits (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  venue_id         uuid not null references venues(id) on delete cascade,
  table_id         uuid not null references venue_tables(id) on delete cascade,
  alias            text not null check (char_length(alias) between 1 and 30),
  mode             chat_mode not null default 'friendly',
  is_open          boolean not null default false,          -- "Open to chat"
  public_key       text,                                    -- E2E public key (JWK), generated in the browser
  marketing_opt_in boolean not null default false,
  opt_in_at        timestamptz,                             -- consent record
  started_at       timestamptz not null default now(),
  ended_at         timestamptz
);
create index visits_active_idx on visits (venue_id) where ended_at is null;
create unique index visits_one_active_per_user on visits (user_id) where ended_at is null;

-- ---------------------------------------------------------------------------
-- Conversations and encrypted messages
-- ---------------------------------------------------------------------------
create table conversations (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references venues(id) on delete cascade,
  visit_a       uuid not null references visits(id) on delete cascade,
  visit_b       uuid not null references visits(id) on delete cascade,
  a_shares_table boolean not null default false,
  b_shares_table boolean not null default false,
  a_keeps       boolean not null default false,   -- "Keep in touch"
  b_keeps       boolean not null default false,
  created_at    timestamptz not null default now(),
  check (visit_a <> visit_b),
  unique (visit_a, visit_b)
);

create table messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_visit    uuid not null references visits(id) on delete cascade,
  ciphertext      text not null check (char_length(ciphertext) <= 8000),
  iv              text not null,
  created_at      timestamptz not null default now()
);
create index messages_conv_idx on messages (conversation_id, id);

-- Mutual "Keep in touch" connections that survive leaving the venue.
create table connections (
  user_a          uuid not null references auth.users(id) on delete cascade,
  user_b          uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  met_venue_id    uuid references venues(id) on delete set null,
  met_at          timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table blocks (
  blocker_user uuid not null references auth.users(id) on delete cascade,
  blocked_user uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (blocker_user, blocked_user)
);

-- Reports carry the messages the reporter chose to submit (decrypted on their own phone).
create table reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_user   uuid not null references auth.users(id) on delete cascade,
  reported_user   uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  reason          text check (char_length(reason) <= 500),
  evidence        jsonb,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

-- ---------------------------------------------------------------------------
-- Venue service
-- ---------------------------------------------------------------------------
create table service_requests (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  table_id   uuid not null references venue_tables(id) on delete cascade,
  visit_id   uuid not null references visits(id) on delete cascade,
  kind       request_kind not null,
  status     request_status not null default 'sent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_requests_open_idx on service_requests (venue_id, created_at)
  where status in ('sent', 'seen');

create table offer_redemptions (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  visit_id    uuid not null unique references visits(id) on delete cascade, -- one per visit
  code        text not null unique,
  redeemed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies can use them without recursion)
-- ---------------------------------------------------------------------------
create or replace function is_venue_member(v uuid, r member_role default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from venue_members
    where venue_id = v and user_id = auth.uid() and (r is null or role = r)
  );
$$;

create or replace function my_active_visit(v uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from visits
  where venue_id = v and user_id = auth.uid() and ended_at is null
  limit 1;
$$;

create or replace function is_blocked_between(u1 uuid, u2 uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
    where (blocker_user = u1 and blocked_user = u2)
       or (blocker_user = u2 and blocked_user = u1)
  );
$$;

create or replace function is_conversation_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations conv
    join visits va on va.id = conv.visit_a
    join visits vb on vb.id = conv.visit_b
    where conv.id = c and auth.uid() in (va.user_id, vb.user_id)
  );
$$;

-- A guest may start a chat only from their own open visit, with someone else who is
-- open at the same venue and not blocked either way.
create or replace function can_start_conversation(v uuid, mine uuid, theirs uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from visits a, visits b
    where a.id = mine and b.id = theirs
      and a.user_id = auth.uid() and b.user_id <> auth.uid()
      and a.venue_id = v and b.venue_id = v
      and a.is_open and b.is_open
      and a.ended_at is null and b.ended_at is null
      and not is_blocked_between(a.user_id, b.user_id)
  );
$$;

-- Who else is open to chat in the room right now. Only callable by a guest who is
-- themselves open at that venue. Exact table labels are never returned here.
create or replace function room_presence(v uuid)
returns table (visit_id uuid, alias text, mode chat_mode, zone text, public_key text)
language sql stable security definer set search_path = public as $$
  select vi.id, vi.alias, vi.mode, t.zone, vi.public_key
  from visits vi
  join venue_tables t on t.id = vi.table_id
  where vi.venue_id = v
    and vi.ended_at is null
    and vi.is_open
    and vi.user_id <> auth.uid()
    and exists (
      select 1 from visits me
      where me.venue_id = v and me.user_id = auth.uid() and me.ended_at is null and me.is_open
    )
    and not is_blocked_between(auth.uid(), vi.user_id);
$$;

-- The other person's table label, only once both have agreed to share.
create or replace function shared_table(c uuid)
returns text language sql stable security definer set search_path = public as $$
  select t.label
  from conversations conv
  join visits va on va.id = conv.visit_a
  join visits vb on vb.id = conv.visit_b
  join venue_tables t on t.id = case when va.user_id = auth.uid() then vb.table_id else va.table_id end
  where conv.id = c
    and auth.uid() in (va.user_id, vb.user_id)
    and conv.a_shares_table and conv.b_shares_table;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table venues            enable row level security;
alter table venue_tables      enable row level security;
alter table venue_members     enable row level security;
alter table profiles          enable row level security;
alter table visits            enable row level security;
alter table conversations     enable row level security;
alter table messages          enable row level security;
alter table connections       enable row level security;
alter table blocks            enable row level security;
alter table reports           enable row level security;
alter table service_requests  enable row level security;
alter table offer_redemptions enable row level security;

-- Venues: public branding is readable by anyone (the QR page needs it). Managers edit.
create policy venues_read on venues for select using (true);
create policy venues_manage on venues for update
  using (is_venue_member(id, 'manager')) with check (is_venue_member(id, 'manager'));

-- Tables: members of the venue can see and manage; guests resolve tables through a function.
create policy tables_member_read on venue_tables for select using (is_venue_member(venue_id));
create policy tables_manage on venue_tables for all
  using (is_venue_member(venue_id, 'manager')) with check (is_venue_member(venue_id, 'manager'));

create policy members_read on venue_members for select
  using (user_id = auth.uid() or is_venue_member(venue_id, 'manager'));
create policy members_manage on venue_members for all
  using (is_venue_member(venue_id, 'manager')) with check (is_venue_member(venue_id, 'manager'));

create policy profiles_own on profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Visits: a guest sees and edits only their own. Managers read opted-in contacts via a view below.
create policy visits_own on visits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Conversations: only the two participants.
create policy conv_read on conversations for select using (is_conversation_member(id));
create policy conv_create on conversations for insert
  with check (can_start_conversation(venue_id, visit_a, visit_b));
create policy conv_update on conversations for update
  using (is_conversation_member(id)) with check (is_conversation_member(id));

-- Messages: only participants can read; only your own visit can send.
create policy msg_read on messages for select using (is_conversation_member(conversation_id));
create policy msg_send on messages for insert with check (
  is_conversation_member(conversation_id)
  and exists (select 1 from visits where id = sender_visit and user_id = auth.uid())
);

create policy connections_read on connections for select using (auth.uid() in (user_a, user_b));
create policy connections_delete on connections for delete using (auth.uid() in (user_a, user_b));

create policy blocks_own on blocks for all
  using (blocker_user = auth.uid()) with check (blocker_user = auth.uid());

create policy reports_create on reports for insert with check (reporter_user = auth.uid());

-- Service requests: the guest creates and sees their own; venue members see and update all.
create policy sr_guest_create on service_requests for insert with check (
  exists (select 1 from visits where id = visit_id and user_id = auth.uid() and ended_at is null
          and visits.venue_id = service_requests.venue_id and visits.table_id = service_requests.table_id)
);
create policy sr_guest_read on service_requests for select using (
  exists (select 1 from visits where id = visit_id and user_id = auth.uid())
  or is_venue_member(venue_id)
);
create policy sr_guest_cancel on service_requests for update using (
  exists (select 1 from visits where id = visit_id and user_id = auth.uid())
) with check (status = 'cancelled');
create policy sr_staff_update on service_requests for update
  using (is_venue_member(venue_id)) with check (is_venue_member(venue_id));

create policy redemptions_read on offer_redemptions for select using (
  is_venue_member(venue_id)
  or exists (select 1 from visits where id = visit_id and user_id = auth.uid())
);
create policy redemptions_staff on offer_redemptions for insert with check (is_venue_member(venue_id));

-- ---------------------------------------------------------------------------
-- Functions called by the app
-- ---------------------------------------------------------------------------

-- Resolve a QR token to the public venue + table info shown on the welcome screen.
create or replace function resolve_table(token text)
returns table (venue_id uuid, venue_slug text, venue_name text, accent text,
               offer_enabled boolean, offer_text text, table_id uuid, table_label text)
language sql stable security definer set search_path = public as $$
  select v.id, v.slug, v.name, v.accent, v.offer_enabled, v.offer_text, t.id, t.label
  from venue_tables t join venues v on v.id = t.venue_id
  where t.qr_token = token;
$$;
grant execute on function resolve_table(text) to anon, authenticated;

-- Start (or switch) a visit at a table. Ends any visit the guest still has open elsewhere.
create or replace function start_visit(token text, p_alias text, p_mode chat_mode,
                                       p_opt_in boolean, p_public_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t venue_tables;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into t from venue_tables where qr_token = token;
  if not found then raise exception 'unknown table'; end if;
  update visits set ended_at = now(), is_open = false
    where user_id = auth.uid() and ended_at is null;
  insert into visits (user_id, venue_id, table_id, alias, mode, marketing_opt_in, opt_in_at, public_key)
    values (auth.uid(), t.venue_id, t.id, trim(p_alias), p_mode, p_opt_in,
            case when p_opt_in then now() end, p_public_key)
    returning id into new_id;
  return new_id;
end;
$$;
grant execute on function start_visit(text, text, chat_mode, boolean, text) to authenticated;

-- Leaving: end the visit and delete chats that neither person chose to keep.
create or replace function end_visit(p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update visits set ended_at = now(), is_open = false
    where id = p_visit and user_id = auth.uid();
  delete from conversations c
    where (c.visit_a = p_visit or c.visit_b = p_visit)
      and not (c.a_keeps and c.b_keeps);
end;
$$;
grant execute on function end_visit(uuid) to authenticated;

-- When both people tap "Keep in touch", record the connection.
create or replace function sync_connection() returns trigger
language plpgsql security definer set search_path = public as $$
declare ua uuid; ub uuid;
begin
  if new.a_keeps and new.b_keeps then
    select user_id into ua from visits where id = new.visit_a;
    select user_id into ub from visits where id = new.visit_b;
    insert into connections (user_a, user_b, conversation_id, met_venue_id)
      values (least(ua, ub), greatest(ua, ub), new.id, new.venue_id)
      on conflict (user_a, user_b) do nothing;
  end if;
  return new;
end;
$$;
create trigger conversations_connection after update of a_keeps, b_keeps on conversations
  for each row execute function sync_connection();

-- Staff redeem a guest's welcome offer (one per visit, opted-in guests only).
create or replace function redeem_offer(p_visit uuid)
returns text language plpgsql security definer set search_path = public as $$
declare vi visits; tl text; code text;
begin
  select * into vi from visits where id = p_visit;
  if not found or not is_venue_member(vi.venue_id) then raise exception 'not allowed'; end if;
  if not vi.marketing_opt_in then raise exception 'guest has not opted in'; end if;
  select label into tl from venue_tables where id = vi.table_id;
  code := 'SD-' || tl || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into offer_redemptions (venue_id, visit_id, code) values (vi.venue_id, p_visit, code);
  return code;
end;
$$;
grant execute on function redeem_offer(uuid) to authenticated;

-- Opted-in guest list for managers only. Email comes from the sign-in account.
create or replace function marketing_contacts(v uuid)
returns table (email text, alias text, opted_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (u.email) u.email::text, vi.alias, vi.opt_in_at
  from visits vi join auth.users u on u.id = vi.user_id
  where vi.venue_id = v and vi.marketing_opt_in and is_venue_member(v, 'manager')
  order by u.email, vi.opt_in_at desc;
$$;
grant execute on function marketing_contacts(uuid) to authenticated;

-- Simple message rate limit: at most 20 messages per minute per sender visit.
create or replace function limit_message_rate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from messages
      where sender_visit = new.sender_visit and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Slow down a little';
  end if;
  return new;
end;
$$;
create trigger messages_rate_limit before insert on messages
  for each row execute function limit_message_rate();

-- ---------------------------------------------------------------------------
-- Realtime: live chat and the staff screen
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table messages, conversations, service_requests;

-- ---------------------------------------------------------------------------
-- Storage bucket for menu PDFs (public read; managers upload through the app)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menus', 'menus', true, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy menus_manager_write on storage.objects for insert to authenticated
  with check (bucket_id = 'menus'
              and is_venue_member(((storage.foldername(name))[1])::uuid, 'manager'));
create policy menus_manager_update on storage.objects for update to authenticated
  using (bucket_id = 'menus'
         and is_venue_member(((storage.foldername(name))[1])::uuid, 'manager'));
