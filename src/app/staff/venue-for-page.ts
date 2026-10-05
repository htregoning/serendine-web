import { createClient } from '@/lib/supabase/server';

export type PageVenue = { id: string; slug: string; name: string; role: 'manager' | 'staff'; currency: string };

// The venue a staff page is for: ?v=<slug>, or the first venue this person works at.
export async function venueForPage(slug: string | undefined): Promise<{ user: boolean; venue: PageVenue | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: false, venue: null };
  const { data } = await supabase.from('venue_members').select('role, venues(id, slug, name)').eq('user_id', user.id);
  type Row = { role: 'manager' | 'staff'; venues: { id: string; slug: string; name: string } | null };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.venues);
  const row = rows.find((r) => r.venues!.slug === slug) ?? rows[0];
  if (!row) return { user: true, venue: null };
  const cur = await supabase.from('venues').select('currency').eq('id', row.venues!.id).maybeSingle();
  const currency = (cur.data as { currency?: string } | null)?.currency ?? 'AED';
  return { user: true, venue: { ...row.venues!, role: row.role, currency } };
}
