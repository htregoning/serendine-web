-- Serendine: a signed-in guest's own page. The places they've been (with their rating),
-- and two weeks (instead of three days) to rate a visit and leave the venue a private note.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

create or replace function my_places()
returns table (visit_id uuid, venue_name text, venue_slug text, kind text, place text, started_at timestamptz,
               ended_at timestamptz, rating int, has_comment boolean, can_rate boolean, groups_enabled boolean)
language sql stable security definer set search_path = public as $$
  select vi.id, v.name, v.slug, v.kind, v.place, vi.started_at, vi.ended_at,
         f.rating, f.comment is not null,
         vi.ended_at is not null and vi.started_at > now() - interval '14 days',
         coalesce(v.groups_enabled, false)
  from visits vi
  join venues v on v.id = vi.venue_id
  left join visit_feedback f on f.visit_id = vi.id
  where vi.user_id = auth.uid()
  order by vi.started_at desc
  limit 50;
$$;
grant execute on function my_places() to authenticated;

create or replace function submit_feedback(p_visit uuid, p_rating int, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare vi visits;
begin
  select * into vi from visits where id = p_visit and user_id = auth.uid();
  if not found then raise exception 'Not your visit'; end if;
  if vi.started_at < now() - interval '14 days' then raise exception 'This visit is too long ago to rate'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then raise exception 'Rating must be 1 to 5'; end if;
  insert into visit_feedback (visit_id, venue_id, user_id, rating, comment)
    values (p_visit, vi.venue_id, auth.uid(), p_rating, nullif(left(trim(coalesce(p_comment, '')), 1000), ''))
  on conflict (visit_id) do update
    set rating = coalesce(excluded.rating, visit_feedback.rating),
        comment = coalesce(excluded.comment, visit_feedback.comment),
        created_at = now(),
        handled_at = null;                       -- a new note shows as new to the venue
end;
$$;
grant execute on function submit_feedback(uuid, int, text) to authenticated;
