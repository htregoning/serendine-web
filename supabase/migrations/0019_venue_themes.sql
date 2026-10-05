-- Serendine: venue themes. Guests see the venue's own look (logo, colours, type style)
-- with a small "Powered by Serendine", and each venue chooses which chat modes it offers.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

-- 1. Theme settings ('serendine' keeps the standard navy and pink look)
alter table venues add column if not exists theme_preset text not null default 'serendine';
alter table venues add column if not exists theme_bg text not null default '#0B1A3A';
alter table venues add column if not exists theme_text text not null default '#FF2E93';
alter table venues add column if not exists theme_accent text not null default '#FF2E93';
alter table venues add column if not exists theme_font text not null default 'modern';
alter table venues add column if not exists allowed_modes text[] not null default '{friendly,networking,dating}';
alter table venues add column if not exists brand_updated_at timestamptz not null default now();

do $$ begin
  alter table venues add constraint venues_theme_colours check (
    theme_bg ~ '^#[0-9A-Fa-f]{6}$' and theme_text ~ '^#[0-9A-Fa-f]{6}$' and theme_accent ~ '^#[0-9A-Fa-f]{6}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table venues add constraint venues_theme_font check (theme_font in ('modern', 'classic', 'minimal'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table venues add constraint venues_theme_preset check (char_length(theme_preset) between 1 and 30);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table venues add constraint venues_allowed_modes check (
    cardinality(allowed_modes) between 1 and 3 and allowed_modes <@ array['friendly', 'networking', 'dating']);
exception when duplicate_object then null; end $$;

-- 2. What a guest's phone needs to draw the venue's look (public: it's on the printed stickers anyway)
create or replace function venue_theme(token text)
returns table (preset text, bg text, fg text, accent text, font text, has_logo boolean,
               brand_version bigint, allowed_modes text[])
language sql stable security definer set search_path = public as $$
  select v.theme_preset, v.theme_bg, v.theme_text, v.theme_accent, v.theme_font, v.logo_data is not null,
         extract(epoch from v.brand_updated_at)::bigint, v.allowed_modes
  from venue_tables t join venues v on v.id = t.venue_id
  where t.qr_token = token;
$$;
grant execute on function venue_theme(text) to anon, authenticated;

-- The same, for the "how was it?" page after a guest leaves.
create or replace function visit_theme(p_visit uuid)
returns table (preset text, bg text, fg text, accent text, font text, has_logo boolean,
               brand_version bigint, allowed_modes text[])
language sql stable security definer set search_path = public as $$
  select v.theme_preset, v.theme_bg, v.theme_text, v.theme_accent, v.theme_font, v.logo_data is not null,
         extract(epoch from v.brand_updated_at)::bigint, v.allowed_modes
  from visits vi join venues v on v.id = vi.venue_id
  where vi.id = p_visit and vi.user_id = auth.uid();
$$;
grant execute on function visit_theme(uuid) to authenticated;

create or replace function venue_logo(v uuid)
returns text language sql stable security definer set search_path = public as $$
  select logo_data from venues where id = v;
$$;
grant execute on function venue_logo(uuid) to anon, authenticated;

-- 3. Managers save the look themselves. Optionally also restyle the table stickers to match.
create or replace function venue_update_brand(v uuid, p_preset text, p_bg text, p_fg text, p_accent text,
                                              p_font text, p_modes text[], p_logo text default null,
                                              p_keep_logo boolean default true,
                                              p_sticker_bg text default null, p_sticker_fg text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_venue(v) then raise exception 'Not allowed'; end if;
  if p_logo is not null and p_logo <> '' and
     (p_logo !~ '^data:image/(png|jpeg|webp);base64,' or char_length(p_logo) > 300000) then
    raise exception 'The logo must be a PNG, JPG or WebP under about 200 KB';
  end if;
  update venues set
    theme_preset = left(coalesce(nullif(trim(p_preset), ''), 'custom'), 30),
    theme_bg = upper(p_bg), theme_text = upper(p_fg), theme_accent = upper(p_accent),
    theme_font = p_font,
    allowed_modes = (select array_agg(distinct m order by m) from unnest(p_modes) m),
    logo_data = case when p_keep_logo then logo_data else nullif(p_logo, '') end,
    brand_updated_at = now()
  where id = v;
  -- Optionally restyle the printed table stickers to match (colours worked out on the manager's screen).
  if p_sticker_bg ~ '^#[0-9A-Fa-f]{6}$' and p_sticker_fg ~ '^#[0-9A-Fa-f]{6}$' then
    update venues set sticker_bg = upper(p_sticker_bg), sticker_fg = upper(p_sticker_fg),
                      sticker_accent = upper(p_accent)
    where id = v;
  end if;
end;
$$;
grant execute on function venue_update_brand(uuid, text, text, text, text, text, text[], text, boolean, text, text) to authenticated;

-- Changing the logo from the sticker designer also refreshes guests' cached copy.
create or replace function touch_brand_on_logo() returns trigger language plpgsql as $$
begin
  if new.logo_data is distinct from old.logo_data then new.brand_updated_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists venues_logo_touch on venues;
create trigger venues_logo_touch before update of logo_data on venues
  for each row execute function touch_brand_on_logo();

-- 4. Guests can only pick a chat mode the venue offers
create or replace function check_visit_mode() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from venues where id = new.venue_id and new.mode::text = any(allowed_modes)) then
    raise exception 'That chat mode is not available here';
  end if;
  return new;
end;
$$;
drop trigger if exists visits_mode_allowed on visits;
create trigger visits_mode_allowed before insert or update of mode on visits
  for each row execute function check_visit_mode();
