-- Serendine: a shorter check-in. Guests start with just a name; chat style, "I am",
-- and the venue's offers can be set (or changed) afterwards from inside the room.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

create or replace function update_my_visit(p_mode text default null, p_gender text default null,
                                           p_opt_in boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare me visits;
begin
  select * into me from visits where user_id = auth.uid() and ended_at is null;
  if not found then raise exception 'You are not checked in'; end if;
  if p_gender is not null and p_gender not in ('male', 'female', 'unspecified') then raise exception 'bad gender'; end if;
  update visits set
    mode = coalesce(p_mode::chat_mode, mode),                   -- the venue's allowed modes are checked by trigger
    gender = coalesce(p_gender, gender),
    marketing_opt_in = coalesce(p_opt_in, marketing_opt_in),
    opt_in_at = case when p_opt_in is true and not marketing_opt_in then now()
                     when p_opt_in is false then null
                     else opt_in_at end
  where id = me.id;
end;
$$;
grant execute on function update_my_visit(text, text, boolean) to authenticated;
