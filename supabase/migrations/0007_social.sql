-- Serendine: gender, optional selfie, and the venue group chat.
-- Paste into Supabase › SQL Editor › New query, then Run.

-- ---------------------------------------------------------------------------
-- 1. Gender, chosen at check-in and shown next to the name
-- ---------------------------------------------------------------------------
alter table visits add column if not exists gender text not null default 'unspecified'
  check (gender in ('male', 'female', 'unspecified'));

drop function if exists start_visit(text, text, chat_mode, boolean, text);
create or replace function start_visit(token text, p_alias text, p_mode chat_mode,
                                       p_opt_in boolean, p_public_key text,
                                       p_gender text default 'unspecified')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t venue_tables;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
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
-- 2. Optional selfie: a small thumbnail kept only for the visit
-- ---------------------------------------------------------------------------
create table if not exists visit_photos (
  visit_id   uuid primary key references visits(id) on delete cascade,
  data       text not null check (data like 'data:image/jpeg;base64,%' and char_length(data) <= 120000),
  updated_at timestamptz not null default now()
);
alter table visit_photos enable row level security;  -- no direct access; functions only

create or replace function set_my_photo(p_data text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from visits where user_id = auth.uid() and ended_at is null;
  if v is null then raise exception 'You are not checked in'; end if;
  insert into visit_photos (visit_id, data) values (v, p_data)
  on conflict (visit_id) do update set data = excluded.data, updated_at = now();
end;
$$;
grant execute on function set_my_photo(text) to authenticated;

create or replace function clear_my_photo()
returns void language sql security definer set search_path = public as $$
  delete from visit_photos
  where visit_id in (select id from visits where user_id = auth.uid() and ended_at is null);
$$;
grant execute on function clear_my_photo() to authenticated;

-- A photo is visible to: its owner; people open at the same venue while the owner
-- is open there; and anyone who shares a chat with the owner. Never across a block.
create or replace function visit_photo(v uuid)
returns text language sql stable security definer set search_path = public as $$
  select ph.data
  from visit_photos ph
  join visits owner on owner.id = ph.visit_id
  where ph.visit_id = v
    and not is_blocked_between(auth.uid(), owner.user_id)
    and (
      owner.user_id = auth.uid()
      or (owner.ended_at is null and owner.is_open and exists (
            select 1 from visits me where me.user_id = auth.uid() and me.ended_at is null
              and me.is_open and me.venue_id = owner.venue_id))
      or exists (
            select 1 from conversations c join visits me on me.id in (c.visit_a, c.visit_b)
            where v in (c.visit_a, c.visit_b) and me.user_id = auth.uid() and me.id <> v)
    );
$$;
grant execute on function visit_photo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who's open, and my chats: now with gender and whether there's a photo
-- ---------------------------------------------------------------------------
drop function if exists room_presence(uuid);
create or replace function room_presence(v uuid)
returns table (visit_id uuid, alias text, mode chat_mode, zone text, public_key text,
               gender text, has_photo boolean)
language sql stable security definer set search_path = public as $$
  select vi.id, vi.alias, vi.mode, t.zone, vi.public_key, vi.gender,
         exists (select 1 from visit_photos ph where ph.visit_id = vi.id)
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
grant execute on function room_presence(uuid) to authenticated;

drop function if exists my_conversations(uuid);
create or replace function my_conversations(v uuid)
returns table (
  conversation_id uuid, partner_visit uuid, partner_alias text, partner_mode chat_mode,
  partner_zone text, partner_key text, i_share boolean, they_share boolean,
  i_keep boolean, they_keep boolean, last_at timestamptz, partner_gender text, partner_has_photo boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, p.id, p.alias, p.mode, t.zone, p.public_key,
    case when me.id = c.visit_a then c.a_shares_table else c.b_shares_table end,
    case when me.id = c.visit_a then c.b_shares_table else c.a_shares_table end,
    case when me.id = c.visit_a then c.a_keeps else c.b_keeps end,
    case when me.id = c.visit_a then c.b_keeps else c.a_keeps end,
    coalesce((select max(m.created_at) from messages m where m.conversation_id = c.id), c.created_at),
    p.gender,
    exists (select 1 from visit_photos ph where ph.visit_id = p.id)
  from conversations c
  join visits me on me.id in (c.visit_a, c.visit_b) and me.user_id = auth.uid()
  join visits p on p.id in (c.visit_a, c.visit_b) and p.id <> me.id
  join venue_tables t on t.id = p.table_id
  where c.venue_id = v
    and me.ended_at is null
    and not is_blocked_between(me.user_id, p.user_id)
  order by 11 desc;
$$;
grant execute on function my_conversations(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Venue group chat. Readable by everyone who is open at the venue (not
--    end-to-end encrypted, and the app says so). Cleared after the night.
-- ---------------------------------------------------------------------------
create table if not exists venue_messages (
  id         bigint generated always as identity primary key,
  venue_id   uuid not null references venues(id) on delete cascade,
  visit_id   uuid not null references visits(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists venue_messages_feed on venue_messages (venue_id, id);
alter table venue_messages enable row level security;
drop policy if exists lobby_read on venue_messages;
create policy lobby_read on venue_messages for select using (
  exists (select 1 from visits me where me.user_id = auth.uid() and me.venue_id = venue_messages.venue_id
          and me.ended_at is null and me.is_open)
);
alter publication supabase_realtime add table venue_messages;

create or replace function post_to_lobby(p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare me visits; new_id bigint;
begin
  select * into me from visits where user_id = auth.uid() and ended_at is null;
  if not found or not me.is_open then raise exception 'Switch on Open to chat to join the group'; end if;
  if (select count(*) from venue_messages where visit_id = me.id and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Slow down a little';
  end if;
  insert into venue_messages (venue_id, visit_id, body) values (me.venue_id, me.id, left(trim(p_body), 500))
    returning id into new_id;
  return new_id;
end;
$$;
grant execute on function post_to_lobby(text) to authenticated;

create or replace function lobby_feed(v uuid)
returns table (id bigint, visit_id uuid, alias text, gender text, has_photo boolean,
               body text, created_at timestamptz, mine boolean, author_open boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select m.id, a.id, a.alias, a.gender,
           exists (select 1 from visit_photos ph where ph.visit_id = a.id),
           m.body, m.created_at, a.user_id = auth.uid(),
           (a.ended_at is null and a.is_open)
    from venue_messages m
    join visits a on a.id = m.visit_id
    where m.venue_id = v
      and m.created_at > now() - interval '12 hours'
      and exists (select 1 from visits me where me.user_id = auth.uid() and me.venue_id = v
                  and me.ended_at is null and me.is_open)
      and not is_blocked_between(auth.uid(), a.user_id)
    order by m.id desc
    limit 150
  ) recent order by 1;
$$;
grant execute on function lobby_feed(uuid) to authenticated;

-- Block (and optionally report) someone from the group chat.
create or replace function block_from_lobby(p_visit uuid, p_report boolean default false,
                                            p_reason text default null, p_message bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare them uuid; evidence jsonb;
begin
  select user_id into them from visits where id = p_visit;
  if them is null or them = auth.uid() then raise exception 'Not allowed'; end if;
  insert into blocks (blocker_user, blocked_user) values (auth.uid(), them) on conflict do nothing;
  if p_report then
    select jsonb_build_object('group_message', body) into evidence from venue_messages where id = p_message;
    insert into reports (reporter_user, reported_user, reason, evidence)
      values (auth.uid(), them, left(p_reason, 500), evidence);
  end if;
  delete from conversations c
  using visits a, visits b
  where a.id = c.visit_a and b.id = c.visit_b
    and ((a.user_id = auth.uid() and b.user_id = them) or (a.user_id = them and b.user_id = auth.uid()));
end;
$$;
grant execute on function block_from_lobby(uuid, boolean, text, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Leaving and automatic check-out also remove photos and old group chat
-- ---------------------------------------------------------------------------
create or replace function end_visit(p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update visits set ended_at = now(), is_open = false
    where id = p_visit and user_id = auth.uid() and ended_at is null;
  delete from visit_photos where visit_id = p_visit
    and exists (select 1 from visits where id = p_visit and user_id = auth.uid());
  delete from conversations c
    where (c.visit_a = p_visit or c.visit_b = p_visit)
      and not (c.a_keeps and c.b_keeps);
end;
$$;
grant execute on function end_visit(uuid) to authenticated;

create or replace function expire_stale_visits()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with stale as (
    update visits set ended_at = now(), is_open = false
    where ended_at is null and started_at < now() - interval '8 hours'
    returning id
  )
  select count(*) into n from stale;

  delete from conversations c
  using visits v
  where v.id in (c.visit_a, c.visit_b) and v.ended_at is not null and not (c.a_keeps and c.b_keeps);

  delete from visit_photos ph using visits v where v.id = ph.visit_id and v.ended_at is not null;
  delete from venue_messages where created_at < now() - interval '12 hours';

  update service_requests set status = 'cancelled'
  where status in ('sent', 'seen') and created_at < now() - interval '8 hours';
  return n;
end;
$$;
revoke execute on function expire_stale_visits() from public, anon, authenticated;
