-- Serendine: Telegram mini app.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.
--
-- Telegram users get notifications as messages from the Serendine bot. Their
-- "subscription" is stored as endpoint 'tg:<telegram id>' by the server after
-- Telegram has confirmed who they are. Nobody can register one from the browser.

create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_endpoint !~ '^https://' then raise exception 'not a browser push address'; end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;
