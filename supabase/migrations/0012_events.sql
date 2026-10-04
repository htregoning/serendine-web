-- Serendine: Event mode.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.
--
-- An event is a venue with a start and end time, where "tables" are areas
-- (a stand, a block, a hall, a zone). Check-in opens 3 hours before the start and
-- closes 3 hours after the end, and everyone is checked out an hour after it ends.

alter table venues add column if not exists kind text not null default 'venue'
  check (kind in ('venue', 'event'));
alter table venues add column if not exists starts_at timestamptz;
alter table venues add column if not exists ends_at timestamptz;
alter table venues add column if not exists place text check (place is null or char_length(place) <= 80);
alter table venues add column if not exists requests_enabled boolean not null default true;

-- Area names can be longer than table numbers, e.g. "North Stand Block 112".
alter table venue_tables drop constraint if exists venue_tables_label_check;
alter table venue_tables add constraint venue_tables_label_check check (char_length(label) between 1 and 40);

-- Guests' view of a table or area now includes the event details.
drop function if exists resolve_table(text);
create or replace function resolve_table(token text)
returns table (venue_id uuid, venue_slug text, venue_name text, accent text,
               offer_enabled boolean, offer_text text, table_id uuid, table_label text,
               drinks_enabled boolean, kind text, starts_at timestamptz, ends_at timestamptz,
               place text, requests_enabled boolean, zone text)
language sql stable security definer set search_path = public as $$
  select v.id, v.slug, v.name, v.accent, v.offer_enabled, v.offer_text, t.id, t.label, v.drinks_enabled,
         v.kind, v.starts_at, v.ends_at, v.place, v.requests_enabled, t.zone
  from venue_tables t join venues v on v.id = t.venue_id
  where t.qr_token = token;
$$;
grant execute on function resolve_table(text) to anon, authenticated;

-- Check-in, now refusing events that haven't opened yet or have finished.
create or replace function start_visit(token text, p_alias text, p_mode chat_mode,
                                       p_opt_in boolean, p_public_key text,
                                       p_gender text default 'unspecified')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t venue_tables;
  ve venues;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from banned_users where user_id = auth.uid()) then
    raise exception 'This account can no longer use Serendine';
  end if;
  if p_gender not in ('male', 'female', 'unspecified') then raise exception 'bad gender'; end if;
  select * into t from venue_tables where qr_token = token;
  if not found then raise exception 'unknown table'; end if;
  select * into ve from venues where id = t.venue_id;
  if ve.kind = 'event' then
    if ve.starts_at is not null and now() < ve.starts_at - interval '3 hours' then
      raise exception 'This event has not opened yet';
    end if;
    if ve.ends_at is not null and now() > ve.ends_at + interval '3 hours' then
      raise exception 'This event has finished';
    end if;
  end if;
  perform end_visit(id) from visits where user_id = auth.uid() and ended_at is null;
  insert into visits (user_id, venue_id, table_id, alias, mode, marketing_opt_in, opt_in_at, public_key, gender)
    values (auth.uid(), t.venue_id, t.id, trim(p_alias), p_mode, p_opt_in,
            case when p_opt_in then now() end, p_public_key, p_gender)
    returning id into new_id;
  return new_id;
end;
$$;
grant execute on function start_visit(text, text, chat_mode, boolean, text, text) to authenticated;

-- Service requests only where the venue has them switched on.
drop policy if exists sr_guest_create on service_requests;
create policy sr_guest_create on service_requests for insert with check (
  exists (select 1 from visits where id = visit_id and user_id = auth.uid() and ended_at is null
          and visits.venue_id = service_requests.venue_id and visits.table_id = service_requests.table_id)
  and exists (select 1 from venues where id = service_requests.venue_id and requests_enabled)
);

-- Automatic check-out: after 8 hours, or an hour after an event ends.
create or replace function expire_stale_visits()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with stale as (
    update visits vi set ended_at = now(), is_open = false
    from venues ve
    where ve.id = vi.venue_id and vi.ended_at is null
      and (vi.started_at < now() - interval '8 hours'
           or (ve.kind = 'event' and ve.ends_at is not null and now() > ve.ends_at + interval '1 hour'))
    returning vi.id
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

-- The admin list now shows the kind and dates.
drop function if exists admin_venues();
create or replace function admin_venues()
returns table (id uuid, slug text, name text, tables integer, team integer, guests_now integer,
               my_role text, created_at timestamptz, kind text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select v.id, v.slug, v.name,
         (select count(*)::int from venue_tables t where t.venue_id = v.id),
         (select count(*)::int from venue_members m where m.venue_id = v.id),
         (select count(*)::int from visits vi where vi.venue_id = v.id and vi.ended_at is null),
         case when is_platform_admin() then 'admin'
              else (select m.role::text from venue_members m where m.venue_id = v.id and m.user_id = auth.uid()) end,
         v.created_at, v.kind, v.starts_at, v.ends_at
  from venues v
  where is_platform_admin() or is_venue_member(v.id, 'manager')
  order by coalesce(v.starts_at, v.created_at) desc;
$$;
grant execute on function admin_venues() to authenticated;

-- Create an event with named areas (one QR code each).
create or replace function admin_create_event(p_name text, p_slug text, p_areas text[],
                                              p_starts timestamptz, p_ends timestamptz, p_place text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
        clean text[];
begin
  if not is_platform_admin() then raise exception 'Only the Serendine admin can add events'; end if;
  if p_slug !~ '^[a-z0-9-]{2,60}$' then raise exception 'Web name must be 2–60 lower-case letters, numbers or dashes'; end if;
  if exists (select 1 from venues where slug = p_slug) then raise exception 'That web name is already taken'; end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then raise exception 'The event must end after it starts'; end if;
  select array_agg(distinct a) into clean
    from (select left(trim(x), 40) a from unnest(p_areas) x) s where a <> '';
  if clean is null then clean := array['Everyone']; end if;
  if array_length(clean, 1) > 300 then raise exception 'Up to 300 areas per event'; end if;
  insert into venues (slug, name, kind, starts_at, ends_at, place, offer_enabled, drinks_enabled, requests_enabled)
    values (p_slug, trim(p_name), 'event', p_starts, p_ends, nullif(trim(p_place), ''), false, false, false)
    returning id into v;
  -- The zone stays blank: other guests see a person's zone, and at an event the
  -- area is exactly where they are, which is only shared when both agree.
  insert into venue_tables (venue_id, label, zone) select v, a, '' from unnest(clean) a;
  return v;
end;
$$;
grant execute on function admin_create_event(text, text, text[], timestamptz, timestamptz, text) to authenticated;

-- Change an event's details (managers can do this too).
create or replace function admin_update_event(v uuid, p_starts timestamptz, p_ends timestamptz, p_place text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then raise exception 'The event must end after it starts'; end if;
  update venues set starts_at = p_starts, ends_at = p_ends, place = nullif(trim(p_place), '') where id = v;
end;
$$;
grant execute on function admin_update_event(uuid, timestamptz, timestamptz, text) to authenticated;

-- Add named areas to an event (or named tables to a venue).
create or replace function admin_add_areas(v uuid, p_areas text[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  insert into venue_tables (venue_id, label, zone)
    select v, a, case when (select kind from venues where id = v) = 'event' then '' else 'Main room' end
    from (select distinct left(trim(x), 40) a from unnest(p_areas) x) s
    where a <> '' and not exists (select 1 from venue_tables t where t.venue_id = v and t.label = s.a);
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function admin_add_areas(uuid, text[]) to authenticated;

-- Managers can switch table service requests on or off.
create or replace function admin_set_requests(v uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  update venues set requests_enabled = p_on where id = v;
end;
$$;
grant execute on function admin_set_requests(uuid, boolean) to authenticated;

-- Editing a table or area. At events the zone stays blank (see above).
create or replace function admin_update_table(p_table uuid, p_label text, p_zone text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
        k text;
begin
  select t.venue_id, ve.kind into v, k from venue_tables t join venues ve on ve.id = t.venue_id where t.id = p_table;
  if v is null or not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if nullif(trim(p_label), '') is null then raise exception 'Give it a name or number'; end if;
  if exists (select 1 from venue_tables where venue_id = v and label = trim(p_label) and id <> p_table) then
    raise exception 'Another one already has that name';
  end if;
  update venue_tables set label = left(trim(p_label), 40),
         zone = case when k = 'event' then '' else coalesce(nullif(trim(p_zone), ''), 'Main room') end
  where id = p_table;
end;
$$;
grant execute on function admin_update_table(uuid, text, text) to authenticated;
