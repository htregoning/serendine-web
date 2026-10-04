-- Serendine: branded table stickers, and a test notification.
-- Paste into Supabase › SQL Editor › New query, then Run.

-- ---------------------------------------------------------------------------
-- Sticker design, per venue
-- ---------------------------------------------------------------------------
alter table venues add column if not exists sticker_bg text not null default '#F7F6FF'
  check (sticker_bg ~ '^#[0-9A-Fa-f]{6}$');
alter table venues add column if not exists sticker_fg text not null default '#0B1A3A'
  check (sticker_fg ~ '^#[0-9A-Fa-f]{6}$');
alter table venues add column if not exists sticker_accent text not null default '#FF2E93'
  check (sticker_accent ~ '^#[0-9A-Fa-f]{6}$');
alter table venues add column if not exists sticker_headline text not null
  default 'Scan to say hello to another table' check (char_length(sticker_headline) <= 60);
alter table venues add column if not exists sticker_sub text not null
  default 'Call a waiter, ask for the bill, see the menu. Stay anonymous until you both agree.'
  check (char_length(sticker_sub) <= 140);
alter table venues add column if not exists logo_data text
  check (logo_data is null or (logo_data ~ '^data:image/(png|jpeg|webp);base64,' and char_length(logo_data) <= 300000));

create or replace function venue_sticker(v uuid)
returns table (bg text, fg text, accent text, headline text, sub text, logo text)
language sql stable security definer set search_path = public as $$
  select sticker_bg, sticker_fg, sticker_accent, sticker_headline, sticker_sub, logo_data
  from venues where id = v and can_manage_venue(v);
$$;
grant execute on function venue_sticker(uuid) to authenticated;

create or replace function admin_update_sticker(v uuid, p_bg text, p_fg text, p_accent text,
                                                p_headline text, p_sub text, p_logo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  update venues set
    sticker_bg = upper(p_bg), sticker_fg = upper(p_fg), sticker_accent = upper(p_accent),
    sticker_headline = left(trim(p_headline), 60), sticker_sub = left(trim(p_sub), 140),
    logo_data = nullif(p_logo, '')
  where id = v;
end;
$$;
grant execute on function admin_update_sticker(uuid, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- "Send test notification": notify your own devices
-- ---------------------------------------------------------------------------
create or replace function push_for_test(r uuid default null)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth, 'Serendine'::text,
         'Notifications are working. You''ll hear from us when someone says hello.'::text,
         '/'::text, 'test'::text
  from push_subscriptions ps
  where ps.user_id = auth.uid();
$$;
grant execute on function push_for_test(uuid) to authenticated;
