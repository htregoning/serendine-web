import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import StaffSignIn from '../../../staff/sign-in';
import VenueAdmin, { type AdminVenueInfo } from './venue-admin';

export const metadata = { title: 'Venue · Serendine admin' };

export default async function VenueAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <StaffSignIn />;

  const [{ data: allowed }, first] = await Promise.all([
    supabase.rpc('can_manage_venue', { v: id }),
    supabase.from('venues').select('id, slug, name, kind, starts_at, ends_at, place').eq('id', id).maybeSingle(),
  ]);
  // Before the events database update is installed, load without the event details.
  const venue: unknown = first.error
    ? (await supabase.from('venues').select('id, slug, name').eq('id', id).maybeSingle()).data
    : first.data;
  if (!allowed || !venue) notFound();

  return <VenueAdmin venue={venue as AdminVenueInfo} me={user.id} />;
}
