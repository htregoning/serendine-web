-- Serendine: sending a drink with a price limit ("up to AED 60") that the sender confirms
-- goes on their own bill. The guest receiving it and the staff both see the limit.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

alter table drink_offers add column if not exists payer_confirmed_at timestamptz;
alter table drink_offers add column if not exists max_amount integer check (max_amount is null or max_amount between 1 and 100000);
-- The limits a venue offers senders, and its currency. Managers can change them.
alter table venues add column if not exists drink_limits integer[] not null default '{40,60,100}';
alter table venues add column if not exists currency text not null default 'AED';

drop function if exists offer_drink(uuid, text);
drop function if exists offer_drink(uuid, text, boolean);
create or replace function offer_drink(p_to uuid, p_note text default null, p_confirmed boolean default false,
                                       p_max integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me visits; them visits; new_id uuid;
begin
  if not coalesce(p_confirmed, false) then
    raise exception 'Please confirm the drink goes on your bill';
  end if;
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
  if p_max is not null and not (p_max = any (select unnest(drink_limits) from venues where id = me.venue_id)) then
    raise exception 'Pick one of the price limits';
  end if;
  if exists (select 1 from drink_offers where from_visit = me.id and to_visit = them.id and status = 'offered') then
    raise exception 'You already offered them a drink';
  end if;
  if (select count(*) from drink_offers where from_visit = me.id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'That''s plenty of drinks for now';
  end if;
  insert into drink_offers (venue_id, from_visit, to_visit, note, payer_confirmed_at, max_amount)
    values (me.venue_id, me.id, them.id, nullif(left(trim(coalesce(p_note, '')), 80), ''), now(), p_max)
    returning id into new_id;
  return new_id;
end;
$$;
grant execute on function offer_drink(uuid, text, boolean, integer) to authenticated;

-- What a sender can choose from.
create or replace function drink_limits_here()
returns table (limits integer[], currency text)
language sql stable security definer set search_path = public as $$
  select v.drink_limits, v.currency from visits me join venues v on v.id = me.venue_id
  where me.user_id = auth.uid() and me.ended_at is null;
$$;
grant execute on function drink_limits_here() to authenticated;

-- Guests' list now shows the limit.
drop function if exists my_drinks();
create or replace function my_drinks()
returns table (id uuid, incoming boolean, other_visit uuid, other_alias text, other_gender text,
               other_has_photo boolean, note text, status text, created_at timestamptz,
               max_amount integer, currency text)
language sql stable security definer set search_path = public as $$
  select d.id, d.to_visit = me.id, o.id, o.alias, o.gender,
         exists (select 1 from visit_photos ph where ph.visit_id = o.id),
         d.note, d.status, d.created_at, d.max_amount, v.currency
  from drink_offers d
  join visits me on me.id in (d.from_visit, d.to_visit) and me.user_id = auth.uid() and me.ended_at is null
  join visits o on o.id in (d.from_visit, d.to_visit) and o.id <> me.id
  join venues v on v.id = d.venue_id
  where not is_blocked_between(me.user_id, o.user_id)
    and not (d.status in ('declined', 'cancelled') and d.updated_at < now() - interval '10 minutes')
  order by d.created_at desc;
$$;
grant execute on function my_drinks() to authenticated;

-- Staff see the limit and that the sender agreed to pay.
drop function if exists staff_drinks(uuid);
create or replace function staff_drinks(v uuid)
returns table (id uuid, from_table text, from_alias text, to_table text, to_alias text,
               note text, accepted_at timestamptz, max_amount integer, currency text, payer_confirmed boolean)
language sql stable security definer set search_path = public as $$
  select d.id, ft.label, f.alias, tt.label, t.alias, d.note, d.updated_at, d.max_amount, ve.currency,
         d.payer_confirmed_at is not null
  from drink_offers d
  join visits f on f.id = d.from_visit
  join visits t on t.id = d.to_visit
  join venue_tables ft on ft.id = f.table_id
  join venue_tables tt on tt.id = t.table_id
  join venues ve on ve.id = d.venue_id
  where d.venue_id = v and d.status = 'accepted' and is_venue_member(v)
  order by d.updated_at;
$$;
grant execute on function staff_drinks(uuid) to authenticated;
