-- Serendine: chat between tables.
-- Paste into Supabase › SQL Editor › New query, then Run.

-- Guests no longer update conversations directly: each person may only set
-- their own "share table" and "keep in touch" choices, through set_conversation_flag.
drop policy if exists conv_update on conversations;
drop policy if exists conv_create on conversations;

-- The signed-in guest's chats at this venue, seen from their side.
create or replace function my_conversations(v uuid)
returns table (
  conversation_id uuid, partner_visit uuid, partner_alias text, partner_mode chat_mode,
  partner_zone text, partner_key text, i_share boolean, they_share boolean,
  i_keep boolean, they_keep boolean, last_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id, p.id, p.alias, p.mode, t.zone, p.public_key,
    case when me.id = c.visit_a then c.a_shares_table else c.b_shares_table end,
    case when me.id = c.visit_a then c.b_shares_table else c.a_shares_table end,
    case when me.id = c.visit_a then c.a_keeps else c.b_keeps end,
    case when me.id = c.visit_a then c.b_keeps else c.a_keeps end,
    coalesce((select max(m.created_at) from messages m where m.conversation_id = c.id), c.created_at)
  from conversations c
  join visits me on me.id in (c.visit_a, c.visit_b) and me.user_id = auth.uid()
  join visits p on p.id in (c.visit_a, c.visit_b) and p.id <> me.id
  join venue_tables t on t.id = p.table_id
  where c.venue_id = v
    and me.ended_at is null
    and not is_blocked_between(me.user_id, p.user_id)
  order by 11 desc;
$$;
grant execute on function my_conversations(uuid) to authenticated;

-- Open the chat with another guest, creating it if needed.
create or replace function start_conversation(theirs uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  mine visits;
  c uuid;
begin
  select * into mine from visits where user_id = auth.uid() and ended_at is null;
  if not found then raise exception 'You are not checked in'; end if;
  select id into c from conversations
    where (visit_a = mine.id and visit_b = theirs) or (visit_a = theirs and visit_b = mine.id);
  if c is not null then return c; end if;
  if not can_start_conversation(mine.venue_id, mine.id, theirs) then
    raise exception 'This person is not available to chat';
  end if;
  insert into conversations (venue_id, visit_a, visit_b) values (mine.venue_id, mine.id, theirs)
    returning id into c;
  return c;
end;
$$;
grant execute on function start_conversation(uuid) to authenticated;

-- Set your own side of "share table" or "keep in touch".
create or replace function set_conversation_flag(c uuid, flag text, val boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  conv conversations;
  mine uuid;
begin
  select * into conv from conversations where id = c;
  if not found then raise exception 'Chat not found'; end if;
  select id into mine from visits
    where user_id = auth.uid() and id in (conv.visit_a, conv.visit_b);
  if mine is null then raise exception 'Not allowed'; end if;
  if flag = 'share' then
    if mine = conv.visit_a then update conversations set a_shares_table = val where id = c;
    else update conversations set b_shares_table = val where id = c; end if;
  elsif flag = 'keep' then
    if mine = conv.visit_a then update conversations set a_keeps = val where id = c;
    else update conversations set b_keeps = val where id = c; end if;
  else
    raise exception 'Unknown option';
  end if;
end;
$$;
grant execute on function set_conversation_flag(uuid, text, boolean) to authenticated;

-- Ignore & block the other person (optionally reporting them). The chat is removed
-- for both; a report keeps the messages the reporter chose to submit.
create or replace function block_partner(c uuid, p_report boolean default false,
                                         p_reason text default null, p_evidence jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  conv conversations;
  me_user uuid := auth.uid();
  them uuid;
begin
  select * into conv from conversations where id = c;
  if not found then raise exception 'Chat not found'; end if;
  select v.user_id into them from visits v
    where v.id in (conv.visit_a, conv.visit_b) and v.user_id <> me_user;
  if them is null or not exists (
    select 1 from visits v where v.id in (conv.visit_a, conv.visit_b) and v.user_id = me_user
  ) then raise exception 'Not allowed'; end if;

  insert into blocks (blocker_user, blocked_user) values (me_user, them) on conflict do nothing;
  if p_report then
    insert into reports (reporter_user, reported_user, conversation_id, reason, evidence)
      values (me_user, them, null, left(p_reason, 500), p_evidence);
  end if;
  delete from connections where user_a = least(me_user, them) and user_b = greatest(me_user, them);
  delete from conversations where id = c;
end;
$$;
grant execute on function block_partner(uuid, boolean, text, jsonb) to authenticated;
