-- Serendine: staff screen support.
-- Paste into Supabase › SQL Editor › New query, then Run.

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
alter publication supabase_realtime add table offer_redemptions;
