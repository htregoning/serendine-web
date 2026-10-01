import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { VenueAtTable } from '@/lib/types';
import Welcome from './welcome';

// The page a table's QR code opens: /t/<token>
export default async function TablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc('resolve_table', { token });
  const venue = (Array.isArray(data) ? data[0] : null) as VenueAtTable | null;
  if (!venue) notFound();

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

  return <Welcome token={token} venue={venue} signedIn={!!user} />;
}
