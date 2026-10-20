-- Serendine: link an event (or a venue) to a tournament or game on On My Compass
-- (play.onmycompass.com, football.onmycompass.com, masters.onmycompass.com).
-- Guests checked in to the event see an "Enter / see the draw" button in the room.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

alter table venues add column if not exists play_url text;
alter table venues add column if not exists play_label text;
-- Only real onmycompass.com addresses (not look-alikes such as fakeonmycompass.com).
-- Dropped and re-added so re-running this file also tightens an earlier, looser check.
alter table venues drop constraint if exists venues_play_url_check;
alter table venues add constraint venues_play_url_check
  check (play_url is null or (play_url ~ '^https://([a-z0-9-]+\.)*onmycompass\.com/' and char_length(play_url) <= 300));
do $$ begin
  alter table venues add constraint venues_play_label_check check (play_label is null or char_length(play_label) <= 60);
exception when duplicate_object then null; end $$;

-- Managers and the admin set (or clear) the link.
create or replace function admin_set_play_link(v uuid, p_url text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if nullif(trim(p_url), '') is not null and trim(p_url) !~ '^https://([a-z0-9-]+\.)*onmycompass\.com/' then
    raise exception 'Use a link from play.onmycompass.com (or football. / masters.onmycompass.com)';
  end if;
  update venues set play_url = nullif(trim(p_url), ''), play_label = nullif(trim(p_label), '') where id = v;
end;
$$;
grant execute on function admin_set_play_link(uuid, text, text) to authenticated;

-- Guests' view: the link for the venue behind a table or area QR code.
create or replace function venue_play_link(token text)
returns table (url text, label text)
language sql stable security definer set search_path = public as $$
  select v.play_url, v.play_label from venue_tables t join venues v on v.id = t.venue_id
  where t.qr_token = token and v.play_url is not null;
$$;
grant execute on function venue_play_link(text) to anon, authenticated;
