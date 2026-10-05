-- Serendine: Seren, the AI host for the venue group chat.
-- Off for every venue until a manager switches it on (and the AI key is set in Vercel).
-- Seren only ever reads and posts in the group chat. Private chats are never touched.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

-- 1. Venue settings
alter table venues add column if not exists host_enabled boolean not null default false;
alter table venues add column if not exists host_tone text not null default 'lively';
do $$ begin
  alter table venues add constraint venues_host_tone check (host_tone in ('lively', 'relaxed', 'family'));
exception when duplicate_object then null; end $$;

-- 2. Group messages can now come from the host (no visit behind them)
alter table venue_messages add column if not exists is_host boolean not null default false;
alter table venue_messages alter column visit_id drop not null;
do $$ begin
  alter table venue_messages add constraint venue_messages_author check (is_host or visit_id is not null);
exception when duplicate_object then null; end $$;

-- 3. Pacing: when the host last spoke at each venue, and how often tonight
create table if not exists host_state (
  venue_id     uuid primary key references venues(id) on delete cascade,
  last_post_at timestamptz,
  night        date,
  posts_night  integer not null default 0
);
alter table host_state enable row level security;   -- no policies: server only

-- 4. The feed now includes host messages
drop function if exists lobby_feed(uuid);
create or replace function lobby_feed(v uuid)
returns table (id bigint, visit_id uuid, alias text, gender text, has_photo boolean,
               body text, created_at timestamptz, mine boolean, author_open boolean, is_host boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select m.id, a.id,
           case when m.is_host then 'Seren' else a.alias end,
           coalesce(a.gender, 'unspecified'),
           coalesce(exists (select 1 from visit_photos ph where ph.visit_id = a.id), false),
           m.body, m.created_at,
           coalesce(a.user_id = auth.uid(), false),
           coalesce(a.ended_at is null and a.is_open, false),
           m.is_host
    from venue_messages m
    left join visits a on a.id = m.visit_id
    where m.venue_id = v
      and m.created_at > now() - interval '12 hours'
      and exists (select 1 from visits me where me.user_id = auth.uid() and me.venue_id = v
                  and me.ended_at is null and me.is_open)
      and (m.is_host or not is_blocked_between(auth.uid(), a.user_id))
    order by m.id desc
    limit 150
  ) recent order by 1;
$$;
grant execute on function lobby_feed(uuid) to authenticated;

-- 5. Ask for a turn to speak. Server only (service role).
--    p_reason 'quiet': 3+ tables open, nobody has spoken for 10 minutes, host silent for 15.
--    p_reason 'mention': someone said "Seren"; at most one reply a minute.
--    Returns the context the host needs, or nothing if it should stay quiet.
create or replace function host_claim(v uuid, p_user uuid, p_reason text)
returns table (venue_name text, tone text, offer text, event_place text, specials text[],
               recent jsonb, open_tables integer)
language plpgsql security definer set search_path = public as $$
declare
  ve venues;
  tables_open integer;
  last_msg timestamptz;
  last_is_host boolean;
  last_body text;
  tonight date := (now() at time zone 'Asia/Dubai')::date;
  claimed integer;
begin
  select * into ve from venues where id = v;
  if not found or not ve.host_enabled then return; end if;
  -- the person asking must be checked in here and open to chat
  if not exists (select 1 from visits where user_id = p_user and venue_id = v and ended_at is null and is_open) then
    return;
  end if;

  select count(distinct table_id) into tables_open from visits where venue_id = v and ended_at is null and is_open;
  select m.created_at, m.is_host, m.body into last_msg, last_is_host, last_body
    from venue_messages m where m.venue_id = v order by m.id desc limit 1;

  if p_reason = 'quiet' then
    if tables_open < 3 then return; end if;
    if last_msg is not null and last_msg > now() - interval '10 minutes' then return; end if;
    if last_is_host then return; end if;                 -- don't talk to an empty room twice
  elsif p_reason = 'mention' then
    if last_is_host or last_msg is null or last_msg < now() - interval '3 minutes' then return; end if;
    if last_body !~* '(seren|سيرين)' then return; end if;
  else
    return;
  end if;

  insert into host_state (venue_id) values (v) on conflict do nothing;
  update host_state hs
     set last_post_at = now(),
         posts_night = case when hs.night = tonight then hs.posts_night + 1 else 1 end,
         night = tonight
   where hs.venue_id = v
     and (hs.last_post_at is null or hs.last_post_at <
          now() - case when p_reason = 'quiet' then interval '15 minutes' else interval '1 minute' end)
     and (hs.night is distinct from tonight or hs.posts_night < 40);
  get diagnostics claimed = row_count;
  if claimed = 0 then return; end if;

  return query
  select ve.name, ve.host_tone,
         case when ve.offer_enabled then ve.offer_text end,
         case when ve.kind = 'event' then ve.place end,
         coalesce((select array_agg(a.body order by a.created_at desc) from venue_announcements a
                   where a.venue_id = v and a.expires_at > now()), '{}'),
         coalesce((select jsonb_agg(jsonb_build_object('who', r.who, 'text', r.body) order by r.id)
                   from (select m.id, m.body, case when m.is_host then 'Seren' else vi.alias end as who
                         from venue_messages m left join visits vi on vi.id = m.visit_id
                         where m.venue_id = v and m.created_at > now() - interval '2 hours'
                         order by m.id desc limit 12) r), '[]'),
         tables_open;
end;
$$;
revoke all on function host_claim(uuid, uuid, text) from public, anon, authenticated;
grant execute on function host_claim(uuid, uuid, text) to service_role;

create or replace function host_post(v uuid, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if char_length(trim(coalesce(p_body, ''))) = 0 then return null; end if;
  insert into venue_messages (venue_id, visit_id, body, is_host)
    values (v, null, left(trim(p_body), 500), true)
    returning id into new_id;
  return new_id;
end;
$$;
revoke all on function host_post(uuid, text) from public, anon, authenticated;
grant execute on function host_post(uuid, text) to service_role;
