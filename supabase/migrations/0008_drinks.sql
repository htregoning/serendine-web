-- Serendine: Send a drink.
-- Paste into Supabase › SQL Editor › New query, then Run.
-- No money passes through Serendine: an accepted drink goes to the staff screen
-- and is added to the sender's bill by the venue as usual.

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

alter publication supabase_realtime add table drink_offers;

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
