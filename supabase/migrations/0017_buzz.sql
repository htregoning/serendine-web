-- Serendine: "7 people here tonight, 3 open to chat".
-- Counts only (never who), so guests can see the room is alive before switching on.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

create or replace function room_buzz(token text)
returns table (here integer, open_now integer)
language sql stable security definer set search_path = public as $$
  select count(*)::int, count(*) filter (where vi.is_open)::int
  from venue_tables t
  join visits vi on vi.venue_id = t.venue_id and vi.ended_at is null
  where t.qr_token = token;
$$;
grant execute on function room_buzz(text) to anon, authenticated;
