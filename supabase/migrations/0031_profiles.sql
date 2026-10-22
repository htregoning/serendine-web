-- Serendine: one saved profile per guest.
--  • Asked once, after the first sign-in: name, email, mobile, date of birth and sex. Never shown to other guests.
--  • Marketing is a separate tick ("offers and birthday treats from venues I visit"), and can be turned off any time.
--  • Venues see a guest's name, email and mobile with their visit history, the birthday (day and month, only for
--    guests who agreed to marketing) and an age band. The full date of birth is never shown to venues.
--  • The screen name from last time is offered again at check-in.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

alter table profiles add column if not exists full_name text;
alter table profiles add column if not exists contact_email text;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists birth_date date;
alter table profiles add column if not exists sex text;
alter table profiles add column if not exists marketing_ok boolean not null default false;
alter table profiles add column if not exists marketing_at timestamptz;
alter table profiles add column if not exists marketing_off_at timestamptz;
alter table profiles add column if not exists last_alias text;
alter table profiles add column if not exists completed_at timestamptz;
do $$ begin
  alter table profiles add constraint profiles_sex_check check (sex is null or sex in ('male', 'female', 'unspecified'));
exception when duplicate_object then null; end $$;

-- Age band for venue reports ("25–34"), never the date itself.
create or replace function age_band(d date)
returns text language sql immutable as $$
  select case
    when d is null then null
    when age(d) < interval '25 years' then '18–24'
    when age(d) < interval '35 years' then '25–34'
    when age(d) < interval '45 years' then '35–44'
    when age(d) < interval '55 years' then '45–54'
    else '55+' end;
$$;

-- The signed-in guest's own profile.
create or replace function my_profile()
returns table (full_name text, email text, email_locked boolean, phone text, birth_date date, sex text,
               marketing_ok boolean, last_alias text, complete boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(p.full_name, nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '')),
         coalesce(nullif(u.email, ''), p.contact_email),
         nullif(u.email, '') is not null,
         coalesce(p.phone, nullif(u.phone, '')),
         p.birth_date, p.sex, coalesce(p.marketing_ok, false), p.last_alias,
         p.completed_at is not null
  from auth.users u left join profiles p on p.user_id = u.id
  where u.id = auth.uid();
$$;
grant execute on function my_profile() to authenticated;

create or replace function save_my_profile(p_name text, p_email text, p_phone text, p_birth_date date,
                                           p_sex text, p_marketing boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  was boolean;
  e text := lower(trim(coalesce(p_email, '')));
  ph text := regexp_replace(coalesce(p_phone, ''), '[\s\-().]', '', 'g');
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Add your name'; end if;
  if (select nullif(email, '') from auth.users where id = auth.uid()) is null
     and e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right';
  end if;
  if ph !~ '^\+\d{8,15}$' then raise exception 'Add your mobile number with the country code, e.g. +971 50 123 4567'; end if;
  if p_birth_date is null then raise exception 'Add your date of birth'; end if;
  if p_birth_date > (current_date - interval '18 years')::date then raise exception 'Serendine is for over-18s only'; end if;
  if p_birth_date < date '1900-01-01' then raise exception 'Check your date of birth'; end if;
  if p_sex not in ('male', 'female', 'unspecified') then raise exception 'Choose an option for sex'; end if;

  select marketing_ok into was from profiles where user_id = auth.uid();
  insert into profiles (user_id, confirmed_adult, full_name, contact_email, phone, birth_date, sex,
                        birth_day, birth_month, marketing_ok, marketing_at, completed_at)
    values (auth.uid(), true, left(trim(p_name), 80), nullif(e, ''), ph, p_birth_date, p_sex,
            extract(day from p_birth_date)::int, extract(month from p_birth_date)::int,
            coalesce(p_marketing, false), case when p_marketing then now() end, now())
  on conflict (user_id) do update set
    confirmed_adult = true,
    full_name = excluded.full_name,
    contact_email = coalesce(excluded.contact_email, profiles.contact_email),
    phone = excluded.phone,
    birth_date = excluded.birth_date,
    sex = excluded.sex,
    birth_day = excluded.birth_day,
    birth_month = excluded.birth_month,
    marketing_ok = excluded.marketing_ok,
    marketing_at = case when excluded.marketing_ok and not coalesce(was, false) then now() else profiles.marketing_at end,
    marketing_off_at = case when not excluded.marketing_ok and coalesce(was, false) then now() else profiles.marketing_off_at end,
    completed_at = coalesce(profiles.completed_at, now());

  -- Turning marketing off also takes back today's venue consent.
  if not coalesce(p_marketing, false) and coalesce(was, false) then
    update visits set marketing_opt_in = false, opt_in_at = null where user_id = auth.uid() and ended_at is null;
  end if;
end;
$$;
grant execute on function save_my_profile(text, text, text, date, text, boolean) to authenticated;

-- At check-in: fill in sex from the profile, apply the marketing tick, and remember the screen name.
create or replace function visits_from_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where user_id = new.user_id;
  if found then
    if coalesce(new.gender, 'unspecified') = 'unspecified' and p.sex is not null then new.gender := p.sex; end if;
    if p.marketing_ok and not new.marketing_opt_in then
      new.marketing_opt_in := true;
      new.opt_in_at := now();
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists visits_profile on visits;
create trigger visits_profile before insert on visits for each row execute function visits_from_profile();

create or replace function visits_remember_alias()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, last_alias) values (new.user_id, new.alias)
  on conflict (user_id) do update set last_alias = excluded.last_alias;
  return new;
end;
$$;
drop trigger if exists visits_alias on visits;
create trigger visits_alias after insert on visits for each row execute function visits_remember_alias();

-- A venue may contact a guest who agreed (at a visit there, or through their profile) since they last said no,
-- and who hasn't unsubscribed from that venue.
create or replace function ok_to_contact(v uuid, u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from visits vi
           left join profiles p on p.user_id = vi.user_id
           where vi.venue_id = v and vi.user_id = u and vi.marketing_opt_in
             and (p.marketing_off_at is null or (vi.opt_in_at is not null and vi.opt_in_at > p.marketing_off_at))
         )
     and not exists (select 1 from venue_unsubscribes where venue_id = v and user_id = u);
$$;
revoke execute on function ok_to_contact(uuid, uuid) from public, anon, authenticated;

-- Names: the profile name first.
create or replace function guest_display_name(u uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(trim(full_name), '') from profiles where user_id = u),
    (select nullif(trim(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', '')), '') from auth.users where id = u));
$$;
revoke execute on function guest_display_name(uuid) from public, anon, authenticated;

-- The guest list, now with mobile and age band.
drop function if exists venue_guests(uuid);
create function venue_guests(v uuid)
returns table (
  user_id uuid, name text, email text, last_alias text,
  visits bigint, first_visit timestamptz, last_visit timestamptz,
  last_table text, last_zone text, ok_to_contact boolean, offers_redeemed bigint,
  drinks_bought bigint, note text, birth_day int, birth_month int, avg_rating numeric,
  phone text, age_band text
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select vi.*, t.label, t.zone from visits vi join venue_tables t on t.id = vi.table_id
    where vi.venue_id = v and can_manage_venue(v)
  ), last as (
    select distinct on (m.user_id) m.user_id, m.alias, m.label, m.zone from mine m
    order by m.user_id, m.started_at desc
  ), g as (
    select m.user_id, count(*) n, min(m.started_at) first_at, max(m.started_at) last_at
    from mine m group by m.user_id
  )
  select g.user_id, guest_display_name(g.user_id), coalesce(nullif(u.email::text, ''), p.contact_email), l.alias,
         g.n, g.first_at, g.last_at, l.label, l.zone, ok_to_contact(v, g.user_id),
         (select count(*) from offer_redemptions r join visits x on x.id = r.visit_id
            where r.venue_id = v and x.user_id = g.user_id),
         (select count(*) from drink_offers d join visits x on x.id = d.from_visit
            where d.venue_id = v and x.user_id = g.user_id and d.status in ('accepted', 'served')),
         coalesce(gn.note, ''),
         case when ok_to_contact(v, g.user_id) then p.birth_day end,
         case when ok_to_contact(v, g.user_id) then p.birth_month end,
         (select round(avg(f.rating)::numeric, 1) from visit_feedback f where f.venue_id = v and f.user_id = g.user_id and f.rating is not null),
         coalesce(p.phone, nullif(u.phone, '')),
         age_band(p.birth_date)
  from g
  join auth.users u on u.id = g.user_id
  join last l on l.user_id = g.user_id
  left join guest_notes gn on gn.venue_id = v and gn.user_id = g.user_id
  left join profiles p on p.user_id = g.user_id
  order by g.last_at desc;
$$;
grant execute on function venue_guests(uuid) to authenticated;
