-- Serendine: photos and short videos.
--  * Private chats: encrypted on the sender's phone; only the two people can open them. Kept 7 days.
--  * Group chat: shown to the room only after a member of staff approves. Kept until the next day.
-- Venues can switch either off. Paste into Supabase › SQL Editor › New query, then Run.
-- Safe to run more than once.

-- 1. Venue switches
alter table venues add column if not exists photos_private boolean not null default true;
alter table venues add column if not exists photos_group boolean not null default true;

-- 2. Storage (files are limited to 25 MB; private-chat files are encrypted, so they arrive as plain bytes)
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', false, 26214400)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-media', 'group-media', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

-- Private chat files live at <conversation id>/<random name>.
create or replace function chat_media_ok(p_name text, p_upload boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare folder text := split_part(p_name, '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if not is_conversation_member(folder::uuid) then return false; end if;
  if p_upload then
    return exists (select 1 from conversations c join venues v on v.id = c.venue_id
                   where c.id = folder::uuid and v.photos_private);
  end if;
  return true;
end;
$$;

-- Group chat files live at <venue id>/<random name>.
create or replace function group_media_can_upload(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare folder text := split_part(p_name, '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return exists (select 1 from visits vi join venues v on v.id = vi.venue_id
                 where vi.user_id = auth.uid() and vi.ended_at is null and vi.is_open
                   and vi.venue_id = folder::uuid and v.photos_group);
end;
$$;

-- 3. Group messages can carry a photo or video, waiting for staff until approved
alter table venue_messages add column if not exists is_host boolean not null default false;   -- from 0018
alter table venue_messages alter column visit_id drop not null;
alter table venue_messages add column if not exists media_path text;
alter table venue_messages add column if not exists media_kind text;
alter table venue_messages add column if not exists status text not null default 'approved';
alter table venue_messages add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table venue_messages drop constraint if exists venue_messages_body_check;
alter table venue_messages drop constraint if exists venue_messages_body_or_media;
alter table venue_messages add constraint venue_messages_body_or_media
  check (char_length(body) <= 500 and (char_length(body) >= 1 or media_path is not null));
do $$ begin
  alter table venue_messages add constraint venue_messages_media_kind check (media_kind is null or media_kind in ('image', 'video'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table venue_messages add constraint venue_messages_status check (status in ('pending', 'approved'));
exception when duplicate_object then null; end $$;
create index if not exists venue_messages_pending on venue_messages (venue_id) where status = 'pending';

create or replace function group_media_can_view(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from venue_messages m
    left join visits a on a.id = m.visit_id
    where m.media_path = p_name
      and (
        a.user_id = auth.uid()                                   -- the person who posted it
        or is_venue_member(m.venue_id)                           -- staff reviewing it
        or (m.status = 'approved' and exists (                   -- the room, once approved
              select 1 from visits me where me.user_id = auth.uid() and me.venue_id = m.venue_id
                and me.ended_at is null and me.is_open))
      )
  );
$$;

drop policy if exists chat_media_read on storage.objects;
create policy chat_media_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and (chat_media_ok(name, false) or is_platform_admin()));   -- admin: reports
drop policy if exists chat_media_write on storage.objects;
create policy chat_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and chat_media_ok(name, true));
drop policy if exists group_media_read on storage.objects;
create policy group_media_read on storage.objects for select to authenticated
  using (bucket_id = 'group-media' and (group_media_can_view(name) or is_platform_admin()));
drop policy if exists group_media_write on storage.objects;
create policy group_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'group-media' and group_media_can_upload(name));

-- 4. Posting a photo or video to the group (it waits for staff)
create or replace function post_media_to_lobby(p_path text, p_kind text, p_caption text default '')
returns bigint language plpgsql security definer set search_path = public as $$
declare me visits; new_id bigint;
begin
  select * into me from visits where user_id = auth.uid() and ended_at is null;
  if not found or not me.is_open then raise exception 'Switch on Open to chat to join the group'; end if;
  if not exists (select 1 from venues where id = me.venue_id and photos_group) then
    raise exception 'Photos are switched off in this group';
  end if;
  if split_part(p_path, '/', 1) <> me.venue_id::text or p_kind not in ('image', 'video') then
    raise exception 'Not allowed';
  end if;
  if (select count(*) from venue_messages where visit_id = me.id and media_path is not null
      and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Slow down a little';
  end if;
  insert into venue_messages (venue_id, visit_id, body, media_path, media_kind, status)
    values (me.venue_id, me.id, left(trim(coalesce(p_caption, '')), 300), p_path, p_kind, 'pending')
    returning id into new_id;
  return new_id;
end;
$$;
grant execute on function post_media_to_lobby(text, text, text) to authenticated;

-- The feed: approved posts for everyone, your own pending ones for you.
drop function if exists lobby_feed(uuid);
create or replace function lobby_feed(v uuid)
returns table (id bigint, visit_id uuid, alias text, gender text, has_photo boolean,
               body text, created_at timestamptz, mine boolean, author_open boolean, is_host boolean,
               media_path text, media_kind text, pending boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select m.id, a.id,
           case when m.is_host then 'Seren' else a.alias end,
           coalesce(a.gender, 'unspecified'),
           coalesce(exists (select 1 from visit_photos ph where ph.visit_id = a.id), false),
           m.body, m.created_at,
           coalesce(a.user_id = auth.uid(), false),
           coalesce(a.ended_at is null and a.is_open, false),
           m.is_host, m.media_path, m.media_kind, m.status = 'pending'
    from venue_messages m
    left join visits a on a.id = m.visit_id
    where m.venue_id = v
      and m.created_at > now() - interval '12 hours'
      and (m.status = 'approved' or a.user_id = auth.uid())
      and exists (select 1 from visits me where me.user_id = auth.uid() and me.venue_id = v
                  and me.ended_at is null and me.is_open)
      and (m.is_host or not is_blocked_between(auth.uid(), a.user_id))
    order by m.id desc
    limit 150
  ) recent order by 1;
$$;
grant execute on function lobby_feed(uuid) to authenticated;

-- 5. Staff review
create or replace function pending_lobby_media(v uuid)
returns table (id bigint, media_path text, media_kind text, caption text, alias text,
               table_label text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.media_path, m.media_kind, m.body, a.alias, t.label, m.created_at
  from venue_messages m
  join visits a on a.id = m.visit_id
  join venue_tables t on t.id = a.table_id
  where m.venue_id = v and m.status = 'pending' and is_venue_member(v)
    and m.created_at > now() - interval '12 hours'
  order by m.id;
$$;
grant execute on function pending_lobby_media(uuid) to authenticated;

create or replace function review_lobby_media(p_id bigint, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m venue_messages;
begin
  select * into m from venue_messages where id = p_id;
  if not found or not is_venue_member(m.venue_id) then raise exception 'Not allowed'; end if;
  if p_approve then
    update venue_messages set status = 'approved', reviewed_by = auth.uid() where id = p_id;
  else
    delete from venue_messages where id = p_id;   -- the file itself is removed by the nightly clean-up
  end if;
end;
$$;
grant execute on function review_lobby_media(bigint, boolean) to authenticated;

-- 6. Files due for deletion (server only): private chat after 7 days, group after a day.
create or replace function expired_media()
returns table (bucket text, path text)
language sql stable security definer set search_path = public, storage as $$
  select o.bucket_id, o.name from storage.objects o
  where (o.bucket_id = 'chat-media' and o.created_at < now() - interval '7 days')
     or (o.bucket_id = 'group-media' and o.created_at < now() - interval '1 day')
  order by o.created_at
  limit 1000;
$$;
revoke all on function expired_media() from public, anon, authenticated;
grant execute on function expired_media() to service_role;

-- 7. Reporting a group photo sends the photo with the report.
create or replace function block_from_lobby(p_visit uuid, p_report boolean default false,
                                            p_reason text default null, p_message bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare them uuid; evidence jsonb;
begin
  select user_id into them from visits where id = p_visit;
  if them is null or them = auth.uid() then raise exception 'Not allowed'; end if;
  insert into blocks (blocker_user, blocked_user) values (auth.uid(), them) on conflict do nothing;
  if p_report then
    select jsonb_strip_nulls(jsonb_build_object('group_message', nullif(body, ''), 'group_media', media_path, 'kind', media_kind))
      into evidence from venue_messages where id = p_message;
    insert into reports (reporter_user, reported_user, reason, evidence)
      values (auth.uid(), them, left(p_reason, 500), evidence);
  end if;
  delete from conversations c
  using visits a, visits b
  where a.id = c.visit_a and b.id = c.visit_b
    and ((a.user_id = auth.uid() and b.user_id = them) or (a.user_id = them and b.user_id = auth.uid()));
end;
$$;
grant execute on function block_from_lobby(uuid, boolean, text, bigint) to authenticated;
