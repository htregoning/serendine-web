-- Serendine: connections that last after leaving the venue.
-- Paste into Supabase › SQL Editor › New query, then Run.

-- People you both chose to keep in touch with, newest activity first.
create or replace function my_connections()
returns table (
  conversation_id uuid, my_visit uuid, partner_visit uuid, partner_alias text,
  partner_mode chat_mode, partner_key text, venue_name text, met_at timestamptz, last_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id, me.id, p.id, p.alias, p.mode, p.public_key, v.name, cn.met_at,
    coalesce((select max(m.created_at) from messages m where m.conversation_id = c.id), c.created_at)
  from connections cn
  join conversations c on c.id = cn.conversation_id
  join visits me on me.id in (c.visit_a, c.visit_b) and me.user_id = auth.uid()
  join visits p on p.id in (c.visit_a, c.visit_b) and p.id <> me.id
  join venues v on v.id = c.venue_id
  where auth.uid() in (cn.user_a, cn.user_b)
    and not is_blocked_between(me.user_id, p.user_id)
  order by 9 desc;
$$;
grant execute on function my_connections() to authenticated;

-- Remove a connection: the chat is deleted for both people (no block, no report).
create or replace function remove_connection(c uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from connections
  where conversation_id = c and auth.uid() in (user_a, user_b);
  if found then
    delete from conversations where id = c;
  end if;
end;
$$;
grant execute on function remove_connection(uuid) to authenticated;
