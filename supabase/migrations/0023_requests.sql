-- Serendine: more ways for a table to reach the staff, and staff claiming requests.
--  * Ready to order, Same again, Ask for anything (a short note), and a discreet "I need help"
--    that only managers see. Managers pick which buttons their guests get.
--  * A member of staff taps "On my way" to claim a request, so two people don't go.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

alter type request_kind add value if not exists 'order';
alter type request_kind add value if not exists 'again';
alter type request_kind add value if not exists 'other';
alter type request_kind add value if not exists 'help';

alter table service_requests add column if not exists note text;
alter table service_requests add column if not exists claimed_by uuid references auth.users(id) on delete set null;
alter table service_requests add column if not exists claimed_name text;
alter table service_requests add column if not exists claimed_at timestamptz;
do $$ begin
  alter table service_requests add constraint service_requests_note_len check (note is null or char_length(note) <= 200);
exception when duplicate_object then null; end $$;

-- Which buttons guests see: the manager chooses (start simple, add more later).
alter table venues add column if not exists request_buttons text[] not null
  default '{order,again,waiter,bill,water,other}';

-- Guests can always ask for help discreetly, even where other requests are switched off.
drop policy if exists sr_guest_create on service_requests;
create policy sr_guest_create on service_requests for insert with check (
  exists (select 1 from visits where id = visit_id and user_id = auth.uid() and ended_at is null
          and visits.venue_id = service_requests.venue_id and visits.table_id = service_requests.table_id)
  and (kind::text = 'help'
       or exists (select 1 from venues where id = service_requests.venue_id and requests_enabled
                  and service_requests.kind::text = any (request_buttons)))
);

-- "I need help" is seen by managers only (and the guest who sent it).
drop policy if exists sr_guest_read on service_requests;
create policy sr_guest_read on service_requests for select using (
  exists (select 1 from visits where id = visit_id and user_id = auth.uid())
  or (is_venue_member(venue_id) and (kind::text <> 'help' or is_venue_member(venue_id, 'manager')))
);
drop policy if exists sr_staff_update on service_requests;
create policy sr_staff_update on service_requests for update
  using (is_venue_member(venue_id) and (kind::text <> 'help' or is_venue_member(venue_id, 'manager')))
  with check (is_venue_member(venue_id));

-- Claim a request: "On my way". The first person to tap gets it.
create or replace function claim_request(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare sr service_requests; who text;
begin
  select * into sr from service_requests where id = p_id;
  if not found or not is_venue_member(sr.venue_id)
     or (sr.kind::text = 'help' and not is_venue_member(sr.venue_id, 'manager')) then
    raise exception 'Not allowed';
  end if;
  select coalesce(nullif(split_part(u.raw_user_meta_data->>'full_name', ' ', 1), ''),
                  nullif(split_part(u.raw_user_meta_data->>'name', ' ', 1), ''),
                  split_part(u.email, '@', 1), 'Staff')
    into who from auth.users u where u.id = auth.uid();
  update service_requests
     set status = 'seen', claimed_by = auth.uid(), claimed_name = left(who, 30), claimed_at = now()
   where id = p_id and status = 'sent';
  if not found then
    select claimed_name into who from service_requests where id = p_id;
    raise exception '% is already on it', coalesce(who, 'Someone');
  end if;
  return who;
end;
$$;
grant execute on function claim_request(uuid) to authenticated;

-- Notifications for new requests: say what's wanted, and send "I need help" to managers only.
create or replace function push_for_new_request(r uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth,
         'Table ' || t.label,
         case sr.kind::text when 'bill' then 'Bring the bill'
                            when 'water' then 'Water please'
                            when 'order' then 'Ready to order'
                            when 'again' then 'Same again' || coalesce(': ' || sr.note, '')
                            when 'other' then coalesce(sr.note, 'A request')
                            when 'help' then 'Needs help (discreet) · managers only'
                            else 'Call a waiter' end,
         '/staff?v=' || v.slug,
         'staff-' || r::text
  from service_requests sr
  join venues v on v.id = sr.venue_id
  join venue_tables t on t.id = sr.table_id
  join visits vi on vi.id = sr.visit_id
  join venue_members vm on vm.venue_id = sr.venue_id
  join push_subscriptions ps on ps.user_id = vm.user_id
  where sr.id = r
    and vi.user_id = auth.uid()
    and sr.created_at > now() - interval '1 minute'
    and (sr.kind::text <> 'help' or vm.role = 'manager');
$$;
grant execute on function push_for_new_request(uuid) to authenticated;
