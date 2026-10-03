-- Serendine: push notifications.
-- Paste into Supabase › SQL Editor › New query, then Run.

-- Each phone or browser that turned notifications on.
create table if not exists push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists push_own_read on push_subscriptions;
create policy push_own_read on push_subscriptions for select using (user_id = auth.uid());
drop policy if exists push_own_delete on push_subscriptions;
create policy push_own_delete on push_subscriptions for delete using (user_id = auth.uid());

-- Save this device for the signed-in person (a shared device moves to them).
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;
grant execute on function save_push_subscription(text, text, text) to authenticated;

-- Remove a device the push service says no longer exists.
create or replace function prune_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;
grant execute on function prune_push_subscription(text) to authenticated;

-- The QR token of the signed-in guest's current table (to reopen their room).
create or replace function my_active_table_token()
returns text language sql stable security definer set search_path = public as $$
  select t.qr_token from visits v join venue_tables t on t.id = v.table_id
  where v.user_id = auth.uid() and v.ended_at is null
  limit 1;
$$;
grant execute on function my_active_table_token() to authenticated;

-- Who to notify, and what to say. Each only works for the person who just did
-- the thing (in the last minute), so nobody can use it to spam others.
-- Message text is never included: it is end-to-end encrypted.

-- A new chat message: notify the other person.
create or replace function push_for_message(c uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth,
         'Serendine'::text,
         'New message from ' || me.alias,
         case when them.ended_at is null then '/t/' || tt.qr_token || '/room' else '/connections' end,
         'chat-' || c::text
  from conversations conv
  join visits me   on me.id in (conv.visit_a, conv.visit_b) and me.user_id = auth.uid()
  join visits them on them.id in (conv.visit_a, conv.visit_b) and them.id <> me.id
  join venue_tables tt on tt.id = them.table_id
  join push_subscriptions ps on ps.user_id = them.user_id
  where conv.id = c
    and exists (select 1 from messages m where m.conversation_id = c and m.sender_visit = me.id
                and m.created_at > now() - interval '1 minute')
    and not is_blocked_between(me.user_id, them.user_id);
$$;
grant execute on function push_for_message(uuid) to authenticated;

-- Staff tapped "On my way": notify the guest.
create or replace function push_for_request_update(r uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth,
         v.name,
         case sr.kind when 'bill' then 'Your bill is on its way'
                      when 'water' then 'Water is on its way'
                      else 'Someone is on the way to your table' end,
         '/t/' || t.qr_token || '/room',
         'request-' || r::text
  from service_requests sr
  join venues v on v.id = sr.venue_id
  join venue_tables t on t.id = sr.table_id
  join visits vi on vi.id = sr.visit_id
  join push_subscriptions ps on ps.user_id = vi.user_id
  where sr.id = r
    and sr.status = 'seen'
    and sr.updated_at > now() - interval '1 minute'
    and is_venue_member(sr.venue_id);
$$;
grant execute on function push_for_request_update(uuid) to authenticated;

-- A guest asked for something: notify the venue's staff and managers.
create or replace function push_for_new_request(r uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth,
         'Table ' || t.label,
         case sr.kind when 'bill' then 'Bring the bill'
                      when 'water' then 'Water please'
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
    and sr.created_at > now() - interval '1 minute';
$$;
grant execute on function push_for_new_request(uuid) to authenticated;
