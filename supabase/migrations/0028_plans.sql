-- Serendine: plans, trials, switching a venue on and off, and deleting it.
--  • Every restaurant starts on a free trial (30 days unless the admin sets another end date).
--  • Managers see how many days are left on their staff screen.
--  • After the trial (or a paid period) ends there are 7 days' grace, then guests can no longer check in
--    until the admin records a payment or extends the trial. Staff screens and settings keep working.
--  • The admin can switch a venue off (guests see "not running here right now") and back on, or delete it.
--  • Events are paid one-off and run for their own dates, so they're never paused by a trial.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

alter table venues add column if not exists plan text not null default 'trial';
alter table venues add column if not exists trial_ends_at timestamptz default (now() + interval '30 days');
alter table venues add column if not exists paid_until timestamptz;
alter table venues add column if not exists switched_off boolean not null default false;
do $$ begin
  alter table venues add constraint venues_plan_check check (plan in ('trial', 'starter', 'venue', 'group', 'event', 'free'));
exception when duplicate_object then null; end $$;
update venues set plan = 'event' where kind = 'event' and plan = 'trial';

-- New events are on the 'event' plan (paid one-off), not a trial.
create or replace function venues_default_plan()
returns trigger language plpgsql as $$
begin
  if new.kind = 'event' and new.plan = 'trial' then new.plan := 'event'; end if;
  return new;
end;
$$;
drop trigger if exists venues_plan on venues;
create trigger venues_plan before insert on venues for each row execute function venues_default_plan();

-- Where a venue stands today.
--   free / event      → always open (unless switched off)
--   trial             → open until trial_ends_at, then 7 days' grace
--   starter/venue/... → open until paid_until, then 7 days' grace
create or replace function venue_access(ve venues)
returns text language sql stable as $$
  select case
    when ve.switched_off then 'off'
    when ve.plan in ('free', 'event') then 'open'
    when ve.plan = 'trial' then
      case when ve.trial_ends_at is null or ve.trial_ends_at > now() then 'trial'
           when ve.trial_ends_at + interval '7 days' > now() then 'grace'
           else 'ended' end
    else
      case when ve.paid_until is not null and ve.paid_until > now() then 'paid'
           when ve.paid_until is not null and ve.paid_until + interval '7 days' > now() then 'grace'
           else 'ended' end
  end;
$$;

-- Can guests check in right now?
create or replace function venue_open(v uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select venue_access(ve) in ('open', 'trial', 'paid', 'grace') from venues ve where ve.id = v), false);
$$;

-- For the table page: is this QR code's venue taking guests?
create or replace function table_open(token text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select venue_open(t.venue_id) from venue_tables t where t.qr_token = token), false);
$$;
grant execute on function table_open(text) to anon, authenticated;

-- Refuse new check-ins at a venue that's switched off or whose plan has lapsed.
create or replace function visits_check_open()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not venue_open(new.venue_id) then
    raise exception 'Serendine isn''t running here right now';
  end if;
  return new;
end;
$$;
drop trigger if exists visits_open on visits;
create trigger visits_open before insert on visits for each row execute function visits_check_open();

-- The venue's plan, for its managers (staff screen banner) and the admin.
create or replace function venue_plan(v uuid)
returns table (plan text, access text, trial_ends_at timestamptz, paid_until timestamptz, days_left integer, switched_off boolean)
language sql stable security definer set search_path = public as $$
  select ve.plan, venue_access(ve), ve.trial_ends_at, ve.paid_until,
         case when ve.plan = 'trial' and ve.trial_ends_at is not null
                then ceil(extract(epoch from (ve.trial_ends_at - now())) / 86400)::int
              when ve.plan in ('starter', 'venue', 'group') and ve.paid_until is not null
                then ceil(extract(epoch from (ve.paid_until - now())) / 86400)::int
              else null end,
         ve.switched_off
  from venues ve
  where ve.id = v and (is_platform_admin() or is_venue_member(v, 'manager'));
$$;
grant execute on function venue_plan(uuid) to authenticated;

-- Admin: set the plan and dates. Pass null to leave a date as it is; p_clear_paid wipes paid_until.
create or replace function admin_set_plan(v uuid, p_plan text, p_trial_ends timestamptz default null,
                                          p_paid_until timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the Serendine admin can change plans'; end if;
  if p_plan not in ('trial', 'starter', 'venue', 'group', 'event', 'free') then raise exception 'Unknown plan'; end if;
  update venues set
    plan = p_plan,
    trial_ends_at = coalesce(p_trial_ends, trial_ends_at),
    paid_until = coalesce(p_paid_until, paid_until)
  where id = v;
end;
$$;
grant execute on function admin_set_plan(uuid, text, timestamptz, timestamptz) to authenticated;

-- Admin: switch a venue off (everyone checked in is checked out) or back on.
create or replace function admin_switch_venue(v uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the Serendine admin can switch venues on or off'; end if;
  update venues set switched_off = not p_on where id = v;
  if not p_on then
    update visits set ended_at = now() where venue_id = v and ended_at is null;
  end if;
end;
$$;
grant execute on function admin_switch_venue(uuid, boolean) to authenticated;

-- Admin: delete a venue and everything in it (tables, visits, chats, orders, guest list, plans…).
-- The venue's name must be typed exactly, as a safety check.
create or replace function admin_delete_venue(v uuid, p_confirm_name text)
returns void language plpgsql security definer set search_path = public as $$
declare ve venues;
begin
  if not is_platform_admin() then raise exception 'Only the Serendine admin can delete venues'; end if;
  select * into ve from venues where id = v;
  if not found then raise exception 'That venue no longer exists'; end if;
  if trim(coalesce(p_confirm_name, '')) <> ve.name then raise exception 'Type the venue''s name exactly to delete it'; end if;
  delete from venues where id = v;
end;
$$;
grant execute on function admin_delete_venue(uuid, text) to authenticated;

-- The admin list, now with each venue's plan and status.
drop function if exists admin_venues();
create function admin_venues()
returns table (id uuid, slug text, name text, tables integer, team integer, guests_now integer,
               my_role text, created_at timestamptz, kind text, starts_at timestamptz, ends_at timestamptz,
               plan text, access text, trial_ends_at timestamptz, paid_until timestamptz)
language sql stable security definer set search_path = public as $$
  select v.id, v.slug, v.name,
         (select count(*)::int from venue_tables t where t.venue_id = v.id),
         (select count(*)::int from venue_members m where m.venue_id = v.id),
         (select count(*)::int from visits vi where vi.venue_id = v.id and vi.ended_at is null),
         case when is_platform_admin() then 'admin'
              else (select m.role::text from venue_members m where m.venue_id = v.id and m.user_id = auth.uid()) end,
         v.created_at, v.kind, v.starts_at, v.ends_at,
         v.plan, venue_access(v), v.trial_ends_at, v.paid_until
  from venues v
  where is_platform_admin() or is_venue_member(v.id, 'manager')
  order by coalesce(v.starts_at, v.created_at) desc;
$$;
grant execute on function admin_venues() to authenticated;
