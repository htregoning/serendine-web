import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { venueAtTable } from '@/lib/venue-server';
import Welcome from './welcome';
import Closed from './closed';

// The page a table's QR code opens: /t/<token>
export default async function TablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const venue = await venueAtTable(token);
  if (!venue) notFound();

  // Switched off, or the venue's plan has lapsed (after update 0028; before it, always open).
  const { data: open, error: openErr } = await supabase.rpc('table_open', { token });
  if (!openErr && open === false) return <Closed venueName={venue.venue_name} />;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: visit } = await supabase
      .from('visits')
      .select('id, table_id')
      .is('ended_at', null)
      .maybeSingle();
    if (visit && visit.table_id === venue.table_id) redirect(`/t/${token}/room`);
  }

  // Offers are only shown to guests who have signed in.
  const shown = user ? venue : { ...venue, offer_text: '' };
  return <Welcome token={token} venue={shown} signedIn={!!user} />;
}
