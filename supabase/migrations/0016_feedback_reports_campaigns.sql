-- Serendine: after-visit ratings, weekly reports, messages to past guests,
-- answer times and birthdays.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Venue settings
-- ---------------------------------------------------------------------------
alter table venues add column if not exists google_review_url text
  check (google_review_url is null or (google_review_url ~ '^https://' and char_length(google_review_url) <= 500));
alter table venues add column if not exists instagram_handle text
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');
alter table venues add column if not exists birthday_offer text
  check (birthday_offer is null or char_length(birthday_offer) <= 120);
alter table venues add column if not exists weekly_report boolean not null default true;

-- ---------------------------------------------------------------------------
-- 1. "How was tonight?"
-- ---------------------------------------------------------------------------
create table if not exists visit_feedback (
  visit_id    uuid primary key references visits(id) on delete cascade,
  venue_id    uuid not null references venues(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rating      int check (rating between 1 and 5),       -- null = the guest skipped
  comment     text check (char_length(comment) <= 1000),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);
create index if not exists visit_feedback_venue on visit_feedback (venue_id, created_at desc);
alter table visit_feedback enable row level security;
-- No direct access: only through the functions below.

-- What the thank-you screen needs to know about a visit (the guest's own only).
create or replace function feedback_info(p_visit uuid)
returns table (venue_name text, google_review_url text, instagram_handle text,
               table_label text, kind text, rated boolean, rating int)
language sql stable security definer set search_path = public as $$
  select ve.name, ve.google_review_url, ve.instagram_handle, t.label, ve.kind,
         f.visit_id is not null, f.rating
  from visits vi
  join venues ve on ve.id = vi.venue_id
  join venue_tables t on t.id = vi.table_id
  left join visit_feedback f on f.visit_id = vi.id
  where vi.id = p_visit and vi.user_id = auth.uid();
$$;
grant execute on function feedback_info(uuid) to authenticated;

-- Save the guest's rating (or a skip). Within 3 days of the visit.
create or replace function submit_feedback(p_visit uuid, p_rating int, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare vi visits;
begin
  select * into vi from visits where id = p_visit and user_id = auth.uid();
  if not found then raise exception 'Not your visit'; end if;
  if vi.started_at < now() - interval '3 days' then raise exception 'This visit is too long ago to rate'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then raise exception 'Rating must be 1 to 5'; end if;
  insert into visit_feedback (visit_id, venue_id, user_id, rating, comment)
    values (p_visit, vi.venue_id, auth.uid(), p_rating, nullif(left(trim(coalesce(p_comment, '')), 1000), ''))
  on conflict (visit_id) do update
    set rating = coalesce(excluded.rating, visit_feedback.rating),
        comment = coalesce(excluded.comment, visit_feedback.comment),
        created_at = now();
end;
$$;
grant execute on function submit_feedback(uuid, int, text) to authenticated;

-- The most recent finished visit (last 36 hours) the guest hasn't rated or skipped.
create or replace function pending_feedback()
returns uuid language sql stable security definer set search_path = public as $$
  select vi.id from visits vi
  where vi.user_id = auth.uid() and vi.ended_at is not null
    and vi.ended_at > now() - interval '36 hours'
    and not exists (select 1 from visit_feedback f where f.visit_id = vi.id)
    and not exists (select 1 from visits a where a.user_id = auth.uid() and a.ended_at is null)
  order by vi.ended_at desc limit 1;
$$;
grant execute on function pending_feedback() to authenticated;

-- Ratings for the venue's managers. Comments are what the guest chose to send the venue.
create or replace function venue_feedback(v uuid, p_days int default 30)
returns table (visit_id uuid, created_at timestamptz, rating int, comment text, name text,
               alias text, table_label text, handled boolean)
language sql stable security definer set search_path = public as $$
  select f.visit_id, f.created_at, f.rating, f.comment, guest_display_name(f.user_id), vi.alias, t.label,
         f.handled_at is not null
  from visit_feedback f
  join visits vi on vi.id = f.visit_id
  join venue_tables t on t.id = vi.table_id
  where f.venue_id = v and f.rating is not null and can_manage_venue(v)
    and f.created_at > now() - make_interval(days => greatest(1, least(p_days, 366)))
  order by f.created_at desc;
$$;
grant execute on function venue_feedback(uuid, int) to authenticated;

create or replace function mark_feedback_handled(p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select venue_id into v from visit_feedback where visit_id = p_visit;
  if v is null or not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  update visit_feedback set handled_at = now() where visit_id = p_visit;
end;
$$;
grant execute on function mark_feedback_handled(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Answer times for table requests
-- ---------------------------------------------------------------------------
alter table service_requests add column if not exists answered_at timestamptz;

create or replace function stamp_request_answered() returns trigger
language plpgsql as $$
begin
  if new.status in ('seen', 'done') and old.status = 'sent' and new.answered_at is null then
    new.answered_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists service_requests_answered on service_requests;
create trigger service_requests_answered before update on service_requests
  for each row execute function stamp_request_answered();

-- ---------------------------------------------------------------------------
-- Birthdays (optional, shared with a venue only by guests who opted in to its offers)
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists birth_day int check (birth_day between 1 and 31);
alter table profiles add column if not exists birth_month int check (birth_month between 1 and 12);

create or replace function set_my_birthday(p_day int, p_month int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (p_day is null) <> (p_month is null) then raise exception 'Add both day and month'; end if;
  insert into profiles (user_id, birth_day, birth_month) values (auth.uid(), p_day, p_month)
  on conflict (user_id) do update set birth_day = excluded.birth_day, birth_month = excluded.birth_month;
end;
$$;
grant execute on function set_my_birthday(int, int) to authenticated;

create or replace function my_birthday()
returns table (birth_day int, birth_month int)
language sql stable security definer set search_path = public as $$
  select birth_day, birth_month from profiles where user_id = auth.uid();
$$;
grant execute on function my_birthday() to authenticated;

-- ---------------------------------------------------------------------------
-- Unsubscribes from a venue's emails
-- ---------------------------------------------------------------------------
create table if not exists venue_unsubscribes (
  venue_id uuid not null references venues(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  at       timestamptz not null default now(),
  primary key (venue_id, user_id)
);
alter table venue_unsubscribes enable row level security;

-- Who a venue may contact: opted in at some visit, and not unsubscribed since.
create or replace function ok_to_contact(v uuid, u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from visits where venue_id = v and user_id = u and marketing_opt_in)
     and not exists (select 1 from venue_unsubscribes where venue_id = v and user_id = u);
$$;
revoke execute on function ok_to_contact(uuid, uuid) from public, anon, authenticated;

-- The guest list, now with birthdays (for guests OK to contact) and unsubscribes respected.
drop function if exists venue_guests(uuid);
create or replace function venue_guests(v uuid)
returns table (
  user_id uuid, name text, email text, last_alias text,
  visits bigint, first_visit timestamptz, last_visit timestamptz,
  last_table text, last_zone text, ok_to_contact boolean, offers_redeemed bigint,
  drinks_bought bigint, note text, birth_day int, birth_month int, avg_rating numeric
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
  select g.user_id, guest_display_name(g.user_id), u.email::text, l.alias,
         g.n, g.first_at, g.last_at, l.label, l.zone, ok_to_contact(v, g.user_id),
         (select count(*) from offer_redemptions r join visits x on x.id = r.visit_id
            where r.venue_id = v and x.user_id = g.user_id),
         (select count(*) from drink_offers d join visits x on x.id = d.from_visit
            where d.venue_id = v and x.user_id = g.user_id and d.status in ('accepted', 'served')),
         coalesce(gn.note, ''),
         case when ok_to_contact(v, g.user_id) then p.birth_day end,
         case when ok_to_contact(v, g.user_id) then p.birth_month end,
         (select round(avg(f.rating)::numeric, 1) from visit_feedback f where f.venue_id = v and f.user_id = g.user_id and f.rating is not null)
  from g
  join auth.users u on u.id = g.user_id
  join last l on l.user_id = g.user_id
  left join guest_notes gn on gn.venue_id = v and gn.user_id = g.user_id
  left join profiles p on p.user_id = g.user_id
  order by g.last_at desc;
$$;
grant execute on function venue_guests(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The week in numbers (used by the Guests page, the report email and the cron)
-- ---------------------------------------------------------------------------
create or replace function venue_week_numbers(v uuid, p_days int default 7)
returns table (check_ins bigint, guests bigint, new_guests bigint, returning_guests bigint,
               opted_in bigint, drinks bigint, offers bigint, requests bigint,
               avg_rating numeric, ratings bigint, low_ratings bigint, avg_answer_seconds int)
language sql stable security definer set search_path = public as $$
  with w as (select now() - make_interval(days => greatest(1, least(p_days, 366))) as since),
  recent as (select vi.* from visits vi, w where vi.venue_id = v and vi.started_at >= w.since)
  select
    (select count(*) from recent),
    (select count(distinct user_id) from recent),
    (select count(distinct r.user_id) from recent r, w
       where not exists (select 1 from visits o where o.venue_id = v and o.user_id = r.user_id and o.started_at < w.since)),
    (select count(distinct r.user_id) from recent r, w
       where exists (select 1 from visits o where o.venue_id = v and o.user_id = r.user_id and o.started_at < w.since)),
    (select count(distinct user_id) from recent where marketing_opt_in),
    (select count(*) from drink_offers d, w where d.venue_id = v and d.created_at >= w.since and d.status in ('accepted', 'served')),
    (select count(*) from offer_redemptions o, w where o.venue_id = v and o.redeemed_at >= w.since),
    (select count(*) from service_requests s, w where s.venue_id = v and s.created_at >= w.since),
    (select round(avg(f.rating)::numeric, 1) from visit_feedback f, w where f.venue_id = v and f.rating is not null and f.created_at >= w.since),
    (select count(*) from visit_feedback f, w where f.venue_id = v and f.rating is not null and f.created_at >= w.since),
    (select count(*) from visit_feedback f, w where f.venue_id = v and f.rating <= 3 and f.created_at >= w.since),
    (select round(avg(extract(epoch from (s.answered_at - s.created_at))))::int
       from service_requests s, w where s.venue_id = v and s.answered_at is not null and s.created_at >= w.since);
$$;
revoke execute on function venue_week_numbers(uuid, int) from public, anon, authenticated;

create or replace function venue_report(v uuid, p_days int default 7)
returns table (venue_name text, check_ins bigint, guests bigint, new_guests bigint, returning_guests bigint,
               opted_in bigint, drinks bigint, offers bigint, requests bigint,
               avg_rating numeric, ratings bigint, low_ratings bigint, avg_answer_seconds int)
language sql stable security definer set search_path = public as $$
  select ve.name, n.* from venues ve, venue_week_numbers(v, p_days) n
  where ve.id = v and can_manage_venue(v);
$$;
grant execute on function venue_report(uuid, int) to authenticated;

-- For the Monday email: every venue with the report switched on, its managers and its numbers.
-- Only the server (service role) can call this.
create or replace function weekly_report_rows()
returns table (venue_id uuid, venue_name text, venue_slug text, manager_emails text[],
               check_ins bigint, guests bigint, new_guests bigint, returning_guests bigint,
               opted_in bigint, drinks bigint, offers bigint, requests bigint,
               avg_rating numeric, ratings bigint, low_ratings bigint, avg_answer_seconds int)
language sql stable security definer set search_path = public as $$
  select ve.id, ve.name, ve.slug,
         array(select u.email::text from venue_members m join auth.users u on u.id = m.user_id
               where m.venue_id = ve.id and m.role = 'manager' and u.email not like '%@telegram.serendine.com'),
         n.*
  from venues ve, lateral venue_week_numbers(ve.id, 7) n
  where ve.weekly_report and ve.kind = 'venue';
$$;
revoke execute on function weekly_report_rows() from public, anon, authenticated;
grant execute on function weekly_report_rows() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Messages to past guests (email)
-- ---------------------------------------------------------------------------
create table if not exists venue_campaigns (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  audience    text not null,
  subject     text not null check (char_length(subject) between 1 and 120),
  body        text not null check (char_length(body) between 1 and 2000),
  sent_by     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  recipients  int not null default 0,
  delivered   int not null default 0
);
alter table venue_campaigns enable row level security;

create or replace function campaign_audience(v uuid, p_audience text)
returns table (user_id uuid, email text, name text)
language sql stable security definer set search_path = public as $$
  with g as (
    select vi.user_id, count(*) n, max(vi.started_at) last_at
    from visits vi where vi.venue_id = v group by vi.user_id
  )
  select g.user_id, u.email::text, guest_display_name(g.user_id)
  from g
  join auth.users u on u.id = g.user_id
  left join profiles p on p.user_id = g.user_id
  where can_manage_venue(v)
    and ok_to_contact(v, g.user_id)
    and u.email not like '%@telegram.serendine.com'
    and case p_audience
          when 'regulars' then g.n >= 2
          when 'birthdays' then p.birth_month = extract(month from now() at time zone 'Asia/Dubai')::int
          when 'lapsed' then g.last_at < now() - interval '30 days'
          when 'recent' then g.last_at >= now() - interval '30 days'
          else true end
  order by g.last_at desc;
$$;
grant execute on function campaign_audience(uuid, text) to authenticated;

-- Record a send (at most 2 a week per venue) and return who it goes to.
create or replace function start_campaign(v uuid, p_audience text, p_subject text, p_body text, p_max int default 100)
returns table (campaign_id uuid, user_id uuid, email text, name text)
language plpgsql security definer set search_path = public as $$
declare cid uuid;
        n int;
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if p_audience not in ('all', 'regulars', 'birthdays', 'lapsed', 'recent') then raise exception 'Unknown audience'; end if;
  if (select count(*) from venue_campaigns where venue_id = v and created_at > now() - interval '7 days') >= 2 then
    raise exception 'You can send 2 messages a week. Guests unsubscribe when they get more.';
  end if;
  select count(*) into n from campaign_audience(v, p_audience);
  if n = 0 then raise exception 'Nobody in that group has agreed to hear from you yet'; end if;
  insert into venue_campaigns (venue_id, audience, subject, body, sent_by, recipients)
    values (v, p_audience, left(trim(p_subject), 120), left(trim(p_body), 2000), auth.uid(), least(n, p_max))
    returning id into cid;
  return query select cid, a.user_id, a.email, a.name from campaign_audience(v, p_audience) a limit greatest(1, least(p_max, 2000));
end;
$$;
grant execute on function start_campaign(uuid, text, text, text, int) to authenticated;

create or replace function finish_campaign(p_id uuid, p_delivered int)
returns void language plpgsql security definer set search_path = public as $$
begin
  update venue_campaigns set delivered = p_delivered
  where id = p_id and sent_by = auth.uid() and created_at > now() - interval '10 minutes';
end;
$$;
grant execute on function finish_campaign(uuid, int) to authenticated;

create or replace function venue_campaign_history(v uuid)
returns table (created_at timestamptz, audience text, subject text, recipients int, delivered int)
language sql stable security definer set search_path = public as $$
  select created_at, audience, subject, recipients, delivered from venue_campaigns
  where venue_id = v and can_manage_venue(v) order by created_at desc limit 10;
$$;
grant execute on function venue_campaign_history(uuid) to authenticated;
