-- Serendine: admin dashboard (restaurants, tables, team, reports, bans).
-- Paste into Supabase › SQL Editor › New query, then Run.
-- Afterwards, make yourself the Serendine admin (see the bottom of this file).

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
