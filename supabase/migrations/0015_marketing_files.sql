-- Serendine: a private folder for marketing files (decks, spreadsheets, flyers),
-- shown on the admin directory page. Only the Serendine admin can see or change it.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

insert into storage.buckets (id, name, public, file_size_limit)
values ('marketing', 'marketing', false, 52428800)
on conflict (id) do nothing;

drop policy if exists marketing_admin_read on storage.objects;
create policy marketing_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'marketing' and is_platform_admin());

drop policy if exists marketing_admin_write on storage.objects;
create policy marketing_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'marketing' and is_platform_admin());

drop policy if exists marketing_admin_update on storage.objects;
create policy marketing_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'marketing' and is_platform_admin());

drop policy if exists marketing_admin_delete on storage.objects;
create policy marketing_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'marketing' and is_platform_admin());
