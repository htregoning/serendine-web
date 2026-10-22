-- Serendine: detailed reports for venue managers.
--  • A summary for a chosen period: guests, new vs returning, how often they come back, time checked in,
--    when they come (day and hour), ages and sex (in groups only), ratings, which features get used, loyalty.
--  • A per-guest table for download.
-- Needs updates 0024 (ordering), 0031 (profiles) and 0032 (loyalty) first.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

create or replace function venue_insights(v uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 366)));
  out jsonb;
begin
  if not can_manage_venue(v) then raise exception 'Managers only'; end if;

  with vis as (
    select vi.*, t.label table_label, t.zone table_zone,
           least(extract(epoch from (coalesce(vi.ended_at, now()) - vi.started_at)) / 60, 480) mins,
           (vi.started_at at time zone 'Asia/Dubai') local_at
    from visits vi join venue_tables t on t.id = vi.table_id
    where vi.venue_id = v and vi.started_at >= since
  ),
  firsts as (select user_id, min(started_at) first_at from visits where venue_id = v group by user_id),
  g as (
    select vis.user_id, count(*) n, bool_or(f.first_at >= since) is_new
    from vis join firsts f on f.user_id = vis.user_id group by vis.user_id
  ),
  used as (
    select vis.id,
      exists (select 1 from service_requests r where r.visit_id = vis.id) req,
      exists (select 1 from conversations c where c.visit_a = vis.id or c.visit_b = vis.id) chat,
      exists (select 1 from venue_messages m where m.visit_id = vis.id) grp,
      exists (select 1 from drink_offers d where d.from_visit = vis.id) drink,
      exists (select 1 from table_orders o where o.visit_id = vis.id) ord,
      exists (select 1 from offer_redemptions o where o.visit_id = vis.id) offer,
      exists (select 1 from loyalty_stamps s where s.visit_id = vis.id) stamp
    from vis
  )
  select jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 366)),
    'check_ins', (select count(*) from vis),
    'guests', (select count(*) from g),
    'new_guests', (select count(*) from g where is_new),
    'returning_guests', (select count(*) from g where not is_new),
    'came_twice_plus', (select count(*) from g where n >= 2),
    'avg_visits', (select round(avg(n)::numeric, 1) from g),
    'avg_minutes', (select round(avg(mins))::int from vis where ended_at is not null and table_zone <> 'Takeaway'),   -- counter visits have no length
    'takeaway_visits', (select count(*) from vis where table_zone = 'Takeaway'),
    'opted_in', (select count(distinct user_id) from vis where ok_to_contact(v, user_id)),
    'by_weekday', (select coalesce(jsonb_agg(jsonb_build_object('k', d, 'n', coalesce(c, 0)) order by d), '[]')
                   from generate_series(1, 7) d
                   left join (select extract(isodow from local_at)::int dd, count(*) c from vis group by 1) x on x.dd = d),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('k', h, 'n', c) order by h), '[]')
                from (select extract(hour from local_at)::int h, count(*) c from vis group by 1) x),
    'ages', (select coalesce(jsonb_agg(jsonb_build_object('k', b, 'n', c) order by b), '[]')
             from (select coalesce(age_band(p.birth_date), 'Not given') b, count(*) c
                   from g left join profiles p on p.user_id = g.user_id group by 1) x),
    'sexes', (select coalesce(jsonb_agg(jsonb_build_object('k', s, 'n', c) order by c desc), '[]')
              from (select coalesce(p.sex, 'unspecified') s, count(*) c
                    from g left join profiles p on p.user_id = g.user_id group by 1) x),
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('k', r, 'n', coalesce(c, 0)) order by r desc), '[]')
                from generate_series(1, 5) r
                left join (select f.rating rr, count(*) c from visit_feedback f
                           where f.venue_id = v and f.created_at >= since and f.rating is not null group by 1) x on x.rr = r),
    'avg_rating', (select round(avg(rating)::numeric, 1) from visit_feedback where venue_id = v and created_at >= since and rating is not null),
    'features', jsonb_build_object(
      'requests', (select count(*) from used where req),
      'chats', (select count(*) from used where chat),
      'group_chat', (select count(*) from used where grp),
      'drinks', (select count(*) from used where drink),
      'orders', (select count(*) from used where ord),
      'offers', (select count(*) from used where offer),
      'loyalty', (select count(*) from used where stamp)
    ),
    'loyalty', jsonb_build_object(
      'stamps', (select coalesce(sum(s.qty), 0) from loyalty_stamps s join loyalty_schemes ls on ls.id = s.scheme_id
                 where ls.venue_id = v and s.created_at >= since),
      'rewards', (select count(*) from loyalty_redemptions r join loyalty_schemes ls on ls.id = r.scheme_id
                  where ls.venue_id = v and r.created_at >= since)
    ),
    'top_tables', (select coalesce(jsonb_agg(jsonb_build_object('k', table_label, 'n', c) order by c desc), '[]')
                   from (select table_label, count(*) c from vis group by 1 order by 2 desc limit 8) x),
    'group_plans', (select count(*) from gatherings ga where ga.venue_id = v and ga.created_at >= since and ga.status <> 'cancelled')
  ) into out;
  return out;
end;
$$;
grant execute on function venue_insights(uuid, int) to authenticated;

-- One row per guest for the period, for download. Contact details as on the guest list.
create or replace function venue_insights_guests(v uuid, p_days int default 30)
returns table (name text, email text, phone text, age_band text, sex text, ok_to_contact boolean,
               visits_in_period bigint, total_visits bigint, first_visit timestamptz, last_visit timestamptz,
               avg_minutes int, last_table text, avg_rating numeric, requests bigint, chats bigint, orders bigint,
               drinks_sent bigint, loyalty_stamps bigint, rewards bigint)
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 366))) s),
  vis as (
    select vi.*, t.label table_label from visits vi join venue_tables t on t.id = vi.table_id, since
    where vi.venue_id = v and vi.started_at >= since.s and can_manage_venue(v)
  )
  select guest_display_name(x.user_id), coalesce(nullif(u.email::text, ''), p.contact_email), coalesce(p.phone, nullif(u.phone, '')),
         age_band(p.birth_date), coalesce(p.sex, 'unspecified'), ok_to_contact(v, x.user_id),
         x.n, (select count(*) from visits a where a.venue_id = v and a.user_id = x.user_id),
         (select min(started_at) from visits a where a.venue_id = v and a.user_id = x.user_id), x.last_at,
         x.mins, (select table_label from vis z where z.user_id = x.user_id order by z.started_at desc limit 1),
         (select round(avg(f.rating)::numeric, 1) from visit_feedback f where f.venue_id = v and f.user_id = x.user_id and f.rating is not null),
         (select count(*) from service_requests r join vis z on z.id = r.visit_id where z.user_id = x.user_id),
         (select count(*) from conversations c join vis z on z.id in (c.visit_a, c.visit_b) where z.user_id = x.user_id),
         (select count(*) from table_orders o join vis z on z.id = o.visit_id where z.user_id = x.user_id),
         (select count(*) from drink_offers d join vis z on z.id = d.from_visit where z.user_id = x.user_id),
         (select coalesce(sum(s.qty), 0) from loyalty_stamps s join loyalty_schemes ls on ls.id = s.scheme_id
            where ls.venue_id = v and s.user_id = x.user_id),
         (select count(*) from loyalty_redemptions r join loyalty_schemes ls on ls.id = r.scheme_id
            where ls.venue_id = v and r.user_id = x.user_id)
  from (
    select user_id, count(*) n, max(started_at) last_at,
           round(avg(least(extract(epoch from (coalesce(ended_at, now()) - started_at)) / 60, 480)))::int mins
    from vis group by user_id
  ) x
  join auth.users u on u.id = x.user_id
  left join profiles p on p.user_id = x.user_id
  order by x.n desc, x.last_at desc;
$$;
grant execute on function venue_insights_guests(uuid, int) to authenticated;
