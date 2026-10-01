-- Create a test venue with 20 tables, and make yourself its manager.
-- Before running: sign in to the live app once (so your account exists),
-- then replace YOUR-EMAIL below and run this in Supabase › SQL Editor.

with v as (
  insert into venues (slug, name, accent, offer_text)
  values ('olive-room', 'The Olive Room', '#E9A23B', '20% off your next drink')
  returning id
), t as (
  insert into venue_tables (venue_id, label, zone)
  select v.id, n::text, case when n <= 10 then 'Main room' when n <= 15 then 'Bar area' else 'Terrace' end
  from v, generate_series(1, 20) as n
  returning venue_id
)
insert into venue_members (venue_id, user_id, role)
select distinct t.venue_id, u.id, 'manager'::member_role
from t, auth.users u
where u.email = 'YOUR-EMAIL';

-- See each table's QR link (replace serendine.com with your Vercel address until the domain is live):
select label, zone, 'https://serendine.com/t/' || qr_token as qr_link
from venue_tables where venue_id = (select id from venues where slug = 'olive-room')
order by label::int;
