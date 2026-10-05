-- Serendine: ordering from the table.
--  * The venue keeps a menu with prices (managers edit it; staff can mark items sold out).
--  * A table sends an order from a phone, or a waiter takes it on the staff screen.
--  * Guests at the table see the order live. Anything staff change is highlighted and the
--    guest confirms it with one tap. The kitchen screen shows confirmed orders.
--  * Payment stays with the venue as usual. Off for every venue until a manager switches it on.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

alter table venues add column if not exists ordering_enabled boolean not null default false;

-- 1. The menu
create table if not exists menu_items (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  category    text not null default 'Menu' check (char_length(category) between 1 and 40),
  name        text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 200),
  price       numeric(10, 2) not null check (price >= 0 and price < 100000),
  available   boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists menu_items_venue on menu_items (venue_id, category, sort);
alter table menu_items enable row level security;
drop policy if exists menu_read on menu_items;
create policy menu_read on menu_items for select using (true);                 -- a menu is public
drop policy if exists menu_manage on menu_items;
create policy menu_manage on menu_items for all
  using (is_venue_member(venue_id, 'manager')) with check (is_venue_member(venue_id, 'manager'));

-- Staff (not only managers) can mark an item sold out or back on.
create or replace function set_item_available(p_item uuid, p_available boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update menu_items set available = p_available
   where id = p_item and is_venue_member(venue_id);
  if not found then raise exception 'Not allowed'; end if;
end;
$$;
grant execute on function set_item_available(uuid, boolean) to authenticated;

-- 2. Orders and their lines
create table if not exists table_orders (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  table_id    uuid not null references venue_tables(id) on delete cascade,
  visit_id    uuid references visits(id) on delete set null,     -- the guest who sent it (none when staff took it)
  placed_by   text not null check (placed_by in ('guest', 'staff')),
  staff_name  text,
  status      text not null default 'sent'
              check (status in ('sent', 'changed', 'accepted', 'preparing', 'ready', 'served', 'cancelled')),
  note        text check (note is null or char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists table_orders_venue on table_orders (venue_id, created_at desc);
create index if not exists table_orders_table on table_orders (table_id, created_at desc);

create table if not exists order_lines (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references table_orders(id) on delete cascade,
  item_id   uuid references menu_items(id) on delete set null,
  name      text not null,
  price     numeric(10, 2) not null,
  qty       integer not null check (qty between 0 and 50),
  note      text check (note is null or char_length(note) <= 120),
  change    text check (change is null or change in ('added', 'removed', 'qty')),  -- what staff changed, until the guest confirms
  sort      integer not null default 0
);
create index if not exists order_lines_order on order_lines (order_id, sort);

alter table table_orders enable row level security;
alter table order_lines enable row level security;

-- Guests checked in at the table, and the venue's staff, can see a table's orders (all writes go through the functions below).
create or replace function can_see_order(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from table_orders t
    where t.id = o and (
      is_venue_member(t.venue_id)
      or exists (select 1 from visits v where v.user_id = auth.uid() and v.ended_at is null
                 and v.table_id = t.table_id and t.created_at > v.started_at - interval '1 minute')
    )
  );
$$;
drop policy if exists orders_read on table_orders;
create policy orders_read on table_orders for select using (can_see_order(id));
drop policy if exists order_lines_read on order_lines;
create policy order_lines_read on order_lines for select using (can_see_order(order_id));

do $$ begin
  alter publication supabase_realtime add table table_orders;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Who is acting, as a short first name for "taken by Sam".
create or replace function staff_first_name()
returns text language sql stable security definer set search_path = public as $$
  select left(coalesce(nullif(split_part(u.raw_user_meta_data->>'full_name', ' ', 1), ''),
                       nullif(split_part(u.raw_user_meta_data->>'name', ' ', 1), ''),
                       split_part(u.email, '@', 1), 'Staff'), 30)
  from auth.users u where u.id = auth.uid();
$$;

-- Lines arrive as [{"item": "<menu item id>", "qty": 2, "note": "no ice"}]. Prices always come from the menu.
create or replace function add_order_lines(o uuid, p_venue uuid, p_lines jsonb, p_change text)
returns integer language plpgsql security definer set search_path = public as $$
declare l jsonb; mi menu_items; n integer := 0; q integer;
begin
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    q := coalesce((l->>'qty')::int, 1);
    if q < 1 or q > 50 then raise exception 'Quantities go from 1 to 50'; end if;
    select * into mi from menu_items where id = (l->>'item')::uuid and venue_id = p_venue;
    if not found then raise exception 'That item is not on the menu'; end if;
    if not mi.available then raise exception '% is sold out', mi.name; end if;
    insert into order_lines (order_id, item_id, name, price, qty, note, change, sort)
      values (o, mi.id, mi.name, mi.price, q, nullif(left(trim(coalesce(l->>'note', '')), 120), ''), p_change,
              coalesce((select max(sort) + 1 from order_lines where order_id = o), 0));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function add_order_lines(uuid, uuid, jsonb, text) from public, anon, authenticated;

-- 3. A guest sends an order from the table
create or replace function place_order(p_lines jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me visits; o uuid;
begin
  select * into me from visits where user_id = auth.uid() and ended_at is null;
  if not found then raise exception 'You are not checked in'; end if;
  if not exists (select 1 from venues where id = me.venue_id and ordering_enabled) then
    raise exception 'Ordering from the table is not switched on here';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'Your order is empty'; end if;
  if (select count(*) from table_orders where visit_id = me.id and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Slow down a little';
  end if;
  insert into table_orders (venue_id, table_id, visit_id, placed_by, note)
    values (me.venue_id, me.table_id, me.id, 'guest', nullif(left(trim(coalesce(p_note, '')), 200), ''))
    returning id into o;
  perform add_order_lines(o, me.venue_id, p_lines, null);
  return o;
end;
$$;
grant execute on function place_order(jsonb, text) to authenticated;

-- 4. A waiter takes an order for a table (goes straight to the kitchen; the table sees it live)
create or replace function staff_place_order(p_table uuid, p_lines jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t venue_tables; o uuid;
begin
  select * into t from venue_tables where id = p_table;
  if not found or not is_venue_member(t.venue_id) then raise exception 'Not allowed'; end if;
  insert into table_orders (venue_id, table_id, placed_by, staff_name, status, note)
    values (t.venue_id, t.id, 'staff', staff_first_name(), 'accepted', nullif(left(trim(coalesce(p_note, '')), 200), ''))
    returning id into o;
  perform add_order_lines(o, t.venue_id, p_lines, null);
  return o;
end;
$$;
grant execute on function staff_place_order(uuid, jsonb, text) to authenticated;

-- 5. Staff change an order before the kitchen starts it. The table sees each change highlighted.
create or replace function staff_change_order(p_order uuid, p_set jsonb default '[]', p_add jsonb default '[]')
returns void language plpgsql security definer set search_path = public as $$
declare o table_orders; l jsonb; cur order_lines; q integer;
begin
  select * into o from table_orders where id = p_order for update;
  if not found or not is_venue_member(o.venue_id) then raise exception 'Not allowed'; end if;
  if o.status not in ('sent', 'changed', 'accepted') then raise exception 'The kitchen has already started this order'; end if;
  -- p_set: [{"line": "<line id>", "qty": 0}]  (0 removes it)
  for l in select * from jsonb_array_elements(coalesce(p_set, '[]'::jsonb)) loop
    select * into cur from order_lines where id = (l->>'line')::uuid and order_id = o.id;
    if not found then continue; end if;
    q := greatest(0, least(50, coalesce((l->>'qty')::int, cur.qty)));
    if q = cur.qty then continue; end if;
    update order_lines set qty = q,
      change = case when cur.change = 'added' then (case when q = 0 then 'removed' else 'added' end)
                    when q = 0 then 'removed' else 'qty' end
    where id = cur.id;
  end loop;
  perform add_order_lines(o.id, o.venue_id, p_add, 'added');
  update table_orders set
    status = case when o.visit_id is not null or o.placed_by = 'guest' then 'changed' else o.status end,
    staff_name = coalesce(o.staff_name, staff_first_name()),
    updated_at = now()
  where id = o.id;
end;
$$;
grant execute on function staff_change_order(uuid, jsonb, jsonb) to authenticated;

-- 6. The table confirms staff changes (anyone checked in at that table)
create or replace function confirm_order_changes(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o table_orders;
begin
  select * into o from table_orders where id = p_order;
  if not found or not exists (select 1 from visits v where v.user_id = auth.uid() and v.ended_at is null and v.table_id = o.table_id) then
    raise exception 'Not allowed';
  end if;
  if o.status <> 'changed' then return; end if;
  delete from order_lines where order_id = o.id and qty = 0;
  update order_lines set change = null where order_id = o.id;
  update table_orders set status = 'accepted', updated_at = now() where id = o.id;
end;
$$;
grant execute on function confirm_order_changes(uuid) to authenticated;

-- A guest can cancel their table's order until the staff accept it.
create or replace function cancel_my_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o table_orders;
begin
  select * into o from table_orders where id = p_order;
  if not found or not exists (select 1 from visits v where v.user_id = auth.uid() and v.ended_at is null and v.table_id = o.table_id) then
    raise exception 'Not allowed';
  end if;
  if o.status not in ('sent', 'changed') then raise exception 'The staff already have this order. Ask your server to change it.'; end if;
  update table_orders set status = 'cancelled', updated_at = now() where id = o.id;
end;
$$;
grant execute on function cancel_my_order(uuid) to authenticated;

-- 7. Staff and kitchen move an order along: sent → accepted → preparing → ready → served (or cancelled)
create or replace function set_order_status(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare o table_orders;
begin
  select * into o from table_orders where id = p_order;
  if not found or not is_venue_member(o.venue_id) then raise exception 'Not allowed'; end if;
  if p_status not in ('accepted', 'preparing', 'ready', 'served', 'cancelled') then raise exception 'Unknown status'; end if;
  if p_status = 'accepted' and o.status = 'changed' then
    raise exception 'Waiting for the table to confirm the changes';
  end if;
  update table_orders set status = p_status, updated_at = now(),
         staff_name = coalesce(staff_name, staff_first_name())
   where id = o.id;
end;
$$;
grant execute on function set_order_status(uuid, text) to authenticated;

-- 8. Reading orders with their lines
create or replace function order_rows(p_venue uuid, p_table uuid, p_open_only boolean)
returns table (id uuid, table_id uuid, table_label text, placed_by text, staff_name text, status text,
               note text, created_at timestamptz, updated_at timestamptz, lines jsonb, currency text)
language sql stable security definer set search_path = public as $$
  select o.id, o.table_id, t.label, o.placed_by, o.staff_name, o.status, o.note, o.created_at, o.updated_at,
         coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'price', l.price, 'qty', l.qty,
                                                       'note', l.note, 'change', l.change) order by l.sort)
                   from order_lines l where l.order_id = o.id), '[]'),
         v.currency
  from table_orders o
  join venue_tables t on t.id = o.table_id
  join venues v on v.id = o.venue_id
  where o.venue_id = p_venue
    and (p_table is null or o.table_id = p_table)
    and o.created_at > now() - interval '12 hours'
    and (not p_open_only or o.status not in ('served', 'cancelled') or o.updated_at > now() - interval '20 minutes')
  order by o.created_at;
$$;
revoke all on function order_rows(uuid, uuid, boolean) from public, anon, authenticated;

-- Staff screen and kitchen
create or replace function venue_orders(v uuid)
returns table (id uuid, table_id uuid, table_label text, placed_by text, staff_name text, status text,
               note text, created_at timestamptz, updated_at timestamptz, lines jsonb, currency text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_venue_member(v) then return; end if;
  return query select * from order_rows(v, null, true);
end;
$$;
grant execute on function venue_orders(uuid) to authenticated;

-- Guests: this table's orders since they sat down
create or replace function my_table_orders()
returns table (id uuid, table_id uuid, table_label text, placed_by text, staff_name text, status text,
               note text, created_at timestamptz, updated_at timestamptz, lines jsonb, currency text)
language plpgsql stable security definer set search_path = public as $$
declare me visits;
begin
  select * into me from visits where user_id = auth.uid() and ended_at is null;
  if not found then return; end if;
  return query select r.* from order_rows(me.venue_id, me.table_id, false) r
               where r.created_at > me.started_at - interval '1 minute';
end;
$$;
grant execute on function my_table_orders() to authenticated;

-- 9. Notifications: a new order from a table goes to the venue's staff; a change goes to the table.
create or replace function push_for_order(o uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  -- New order from a guest → staff
  select ps.endpoint, ps.p256dh, ps.auth,
         'Table ' || t.label || ' · new order',
         (select string_agg(l.qty || '× ' || l.name, ', ' order by l.sort) from order_lines l where l.order_id = ord.id),
         '/staff?v=' || ve.slug, 'order-' || o::text
  from table_orders ord
  join venues ve on ve.id = ord.venue_id
  join venue_tables t on t.id = ord.table_id
  join visits vi on vi.id = ord.visit_id
  join venue_members vm on vm.venue_id = ord.venue_id
  join push_subscriptions ps on ps.user_id = vm.user_id
  where ord.id = o and ord.status = 'sent' and vi.user_id = auth.uid()
    and ord.created_at > now() - interval '1 minute'
  union all
  -- Staff changed it, or it's ready → everyone checked in at that table
  select ps.endpoint, ps.p256dh, ps.auth,
         case ord.status when 'changed' then 'Your order was changed' when 'ready' then 'Your order is ready' else 'Your order' end,
         case ord.status when 'changed' then 'Check the changes and confirm' when 'ready' then 'On its way to your table' else 'Tap to see it' end,
         '/t/' || t.qr_token || '/room', 'order-' || o::text
  from table_orders ord
  join venue_tables t on t.id = ord.table_id
  join visits gv on gv.table_id = ord.table_id and gv.ended_at is null
  join push_subscriptions ps on ps.user_id = gv.user_id
  where ord.id = o and ord.status in ('changed', 'ready') and is_venue_member(ord.venue_id)
    and ord.updated_at > now() - interval '1 minute';
$$;
grant execute on function push_for_order(uuid) to authenticated;
