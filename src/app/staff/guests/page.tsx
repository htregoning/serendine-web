import { createClient } from '@/lib/supabase/server';
import StaffSignIn from '../sign-in';
import Guests from './guests';

export const metadata = { title: 'Guests · Serendine' };

type V = { id: string; slug: string; name: string };

// The venue's guest list: /staff/guests?v=<slug>. Managers and the Serendine admin only.
export default async function GuestsPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <StaffSignIn />;

  let venue: V | null = null;
  if (v) {
    const { data } = await supabase.from('venues').select('id, slug, name').eq('slug', v).maybeSingle();
    venue = (data as V | null) ?? null;
  } else {
    const { data: rows } = await supabase
      .from('venue_members')
      .select('venues(id, slug, name)')
      .eq('user_id', user.id)
      .eq('role', 'manager');
    venue = ((rows ?? []) as unknown as { venues: V | null }[]).find((r) => r.venues)?.venues ?? null;
  }

  const { data: allowed } = venue ? await supabase.rpc('can_manage_venue', { v: venue.id }) : { data: false };
  if (!venue || !allowed) {
    return (
      <main className="shell" style={{ justifyContent: 'center' }}>
        <h1 className="display">Managers only</h1>
        <p className="lede">Sign in with a manager account for this venue to see its guests.</p>
      </main>
    );
  }

  return <Guests venue={venue} />;
}
