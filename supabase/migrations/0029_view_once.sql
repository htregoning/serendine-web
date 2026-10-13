-- Serendine: view-once photos and videos in private chats.
-- A view-once file is stored as <conversation id>/once-<random>. Once the other person has opened it,
-- their phone deletes it, so it can't be opened again (or downloaded later from another device).
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

drop policy if exists chat_media_once_delete on storage.objects;
create policy chat_media_once_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and split_part(name, '/', 2) like 'once-%' and chat_media_ok(name, false));
