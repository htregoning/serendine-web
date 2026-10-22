-- Serendine pass: a guest's own QR code for loyalty at the counter (takeaway coffee and the like).
--  • Each guest has a private pass code. The QR on their phone opens serendine.com/s/<code>.
--  • Only signed-in staff at a Serendine venue can use it: they see the guest's cards there, add stamps and redeem.
--  • A scan records one "Takeaway" visit per day, so takeaway customers count for visit rewards and appear
--    in the guest list and reports like any other guest.
-- Needs updates 0031 (profiles) and 0032 (loyalty) first.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

create table if not exists loyalty_passes (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  code        text not null unique check (code ~ '^[2-9A-HJ-NP-Z]{8}$'),
  created_at  timestamptz not null default now()
);
alter table loyalty_passes enable row level security;     -- through the functions below

-- Each venue gets one hidden "Takeaway" table for counter visits (never printed as a sticker).
alter table venue_tables add column if not exists hidden boolean not null default false;

create or replace function admin_tables(v uuid)
returns table (id uuid, label text, zone text, qr_token text, guests_now integer)
language sql stable security definer set search_path = public as $$
  select t.id, t.label, t.zone, t.qr_token,
         (select count(*)::int from visits vi where vi.table_id = t.id and vi.ended_at is null)
  from venue_tables t
  where t.venue_id = v and can_manage_venue(v) and not t.hidden
  order by (case when t.label ~ '^[0-9]+$' then lpad(t.label, 6, '0') else t.label end);
$$;
grant execute on function admin_tables(uuid) to authenticated;

create or replace function new_pass_code()
returns text language sql volatile as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 8);
$$;

-- The guest's pass (made the first time it's opened). p_renew = true replaces the code (if it was shared).
create or replace function my_pass(p_renew boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select code into c from loyalty_passes where user_id = auth.uid();
  if c is not null and not coalesce(p_renew, false) then return c; end if;
  loop
    c := new_pass_code();
    begin
      insert into loyalty_passes (user_id, code) values (auth.uid(), c)
      on conflict (user_id) do update set code = excluded.code, created_at = now();
      return c;
    exception when unique_violation then
      -- another guest already has this code: try again
    end;
  end loop;
end;
$$;
grant execute on function my_pass(boolean) to authenticated;

-- Staff: which of my venues can use this pass (for staff at several venues).
create or replace function staff_pass_venues(p_code text)
returns table (venue_id uuid, venue_slug text, venue_name text, guest_name text)
language sql stable security definer set search_path = public as $$
  select v.id, v.slug, v.name, coalesce(split_part(guest_display_name(p.user_id), ' ', 1), 'Guest')
  from loyalty_passes p
  join venue_members m on m.user_id = auth.uid()
  join venues v on v.id = m.venue_id
  where p.code = upper(replace(replace(trim(p_code), '-', ''), ' ', ''))
  order by v.name;
$$;
grant execute on function staff_pass_venues(text) to authenticated;

create or replace function pass_user(p_code text)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from loyalty_passes where code = upper(replace(replace(trim(p_code), '-', ''), ' ', ''));
$$;
revoke execute on function pass_user(text) from public, anon, authenticated;

-- Records today's takeaway visit for this guest at this venue (once a day), and returns it.
create or replace function pass_visit(v uuid, u uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t uuid;
  vid uuid;
  kept text;
  m chat_mode;
begin
  select id into vid from visits vi
    where vi.venue_id = v and vi.user_id = u
      and (vi.started_at at time zone 'Asia/Dubai')::date = (now() at time zone 'Asia/Dubai')::date
    order by vi.started_at desc limit 1;
  if vid is not null then return vid; end if;

  select id into t from venue_tables where venue_id = v and hidden;
  if t is null then
    insert into venue_tables (venue_id, label, zone, hidden) values (v, 'Takeaway', 'Takeaway', true) returning id into t;
  end if;
  select coalesce((select (allowed_modes)[1]::chat_mode from venues where id = v), 'friendly') into m;
  select last_alias into kept from profiles where user_id = u;
  insert into visits (user_id, venue_id, table_id, alias, mode, started_at, ended_at)
    values (u, v, t, coalesce(nullif(kept, ''), 'Guest'), m, now(), now())
    returning id into vid;
  update profiles set last_alias = kept where user_id = u;    -- a counter visit doesn't change the screen name
  return vid;
end;
$$;
revoke execute on function pass_visit(uuid, uuid) from public, anon, authenticated;

-- Staff: the guest's cards at this venue.
create or replace function staff_pass(p_code text, v uuid)
returns table (guest_name text, visited_today boolean, scheme_id uuid, scheme text, kind text, item text, target integer,
               reward text, progress integer, ready integer)
language plpgsql stable security definer set search_path = public as $$
declare u uuid := pass_user(p_code);
begin
  if u is null then raise exception 'That pass code isn''t recognised'; end if;
  if not is_venue_member(v) then raise exception 'Staff only'; end if;
  return query
    select coalesce(split_part(guest_display_name(u), ' ', 1), 'Guest'),
           exists (select 1 from visits vi where vi.venue_id = v and vi.user_id = u
                     and (vi.started_at at time zone 'Asia/Dubai')::date = (now() at time zone 'Asia/Dubai')::date),
           s.id, s.name, s.kind, s.item, s.target, s.reward,
           (loyalty_state(s, u)).progress, (loyalty_state(s, u)).ready
    from (select 1) one
    left join loyalty_schemes s on s.venue_id = v and s.active
    order by s.created_at;
end;
$$;
grant execute on function staff_pass(text, uuid) to authenticated;

create or replace function pass_checkin(p_code text, v uuid)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := pass_user(p_code);
begin
  if u is null then raise exception 'That pass code isn''t recognised'; end if;
  if not is_venue_member(v) then raise exception 'Staff only'; end if;
  if exists (select 1 from banned_users where user_id = u) then raise exception 'This account can no longer use Serendine'; end if;
  perform pass_visit(v, u);
end;
$$;
grant execute on function pass_checkin(text, uuid) to authenticated;

create or replace function pass_stamp(p_code text, v uuid, p_scheme uuid, p_qty integer default 1)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := pass_user(p_code); s loyalty_schemes; vid uuid;
begin
  if u is null then raise exception 'That pass code isn''t recognised'; end if;
  if not is_venue_member(v) then raise exception 'Staff only'; end if;
  select * into s from loyalty_schemes where id = p_scheme and venue_id = v and active;
  if not found then raise exception 'That loyalty card is no longer running'; end if;
  if s.kind <> 'stamps' then raise exception 'Visits are counted automatically'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then raise exception 'Add 1 to 10 at a time'; end if;
  if exists (select 1 from banned_users where user_id = u) then raise exception 'This account can no longer use Serendine'; end if;
  vid := pass_visit(v, u);
  insert into loyalty_stamps (scheme_id, user_id, visit_id, qty, added_by) values (s.id, u, vid, p_qty, auth.uid());
end;
$$;
grant execute on function pass_stamp(text, uuid, uuid, integer) to authenticated;

create or replace function pass_undo(p_code text, v uuid, p_scheme uuid)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := pass_user(p_code); last_id bigint;
begin
  if u is null or not is_venue_member(v) then raise exception 'Not allowed'; end if;
  select st.id into last_id from loyalty_stamps st join loyalty_schemes s on s.id = st.scheme_id
    where st.scheme_id = p_scheme and s.venue_id = v and st.user_id = u and st.created_at > now() - interval '10 minutes'
    order by st.id desc limit 1;
  if last_id is null then raise exception 'Nothing recent to undo'; end if;
  delete from loyalty_stamps where id = last_id;
end;
$$;
grant execute on function pass_undo(text, uuid, uuid) to authenticated;

create or replace function pass_redeem(p_code text, v uuid, p_scheme uuid)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := pass_user(p_code); s loyalty_schemes; vid uuid;
begin
  if u is null then raise exception 'That pass code isn''t recognised'; end if;
  if not is_venue_member(v) then raise exception 'Staff only'; end if;
  select * into s from loyalty_schemes where id = p_scheme and venue_id = v;
  if not found then raise exception 'Not allowed'; end if;
  if (loyalty_state(s, u)).ready < 1 then raise exception 'No reward ready yet'; end if;
  vid := pass_visit(v, u);
  insert into loyalty_redemptions (scheme_id, user_id, visit_id, redeemed_by) values (s.id, u, vid, auth.uid());
end;
$$;
grant execute on function pass_redeem(text, uuid, uuid) to authenticated;
