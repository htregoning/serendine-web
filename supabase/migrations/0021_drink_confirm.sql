-- Serendine: the sender confirms a drink goes on their own bill before it is offered.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

alter table drink_offers add column if not exists payer_confirmed_at timestamptz;

drop function if exists offer_drink(uuid, text);
create or replace function offer_drink(p_to uuid, p_note text default null, p_confirmed boolean default false)
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
  if exists (select 1 from drink_offers where from_visit = me.id and to_visit = them.id and status = 'offered') then
    raise exception 'You already offered them a drink';
  end if;
  if (select count(*) from drink_offers where from_visit = me.id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'That''s plenty of drinks for now';
  end if;
  insert into drink_offers (venue_id, from_visit, to_visit, note, payer_confirmed_at)
    values (me.venue_id, me.id, them.id, nullif(left(trim(coalesce(p_note, '')), 80), ''), now())
    returning id into new_id;
  return new_id;
end;
$$;
grant execute on function offer_drink(uuid, text, boolean) to authenticated;
