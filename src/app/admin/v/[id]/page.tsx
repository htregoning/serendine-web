import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import StaffSignIn from '../../../staff/sign-in';
import VenueAdmin from './venue-admin';

export const metadata = { title: 'Venue · Serendine admin' };

export default async function VenueAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <StaffSignIn />;

  const [{ data: allowed }, { data: venue }] = await Promise.all([
    supabase.rpc('can_manage_venue', { v: id }),
    supabase.from('venues').select('id, slug, name').eq('id', id).maybeSingle(),
  ]);
  if (!allowed || !venue) notFound();

  return <VenueAdmin venue={venue as { id: string; slug: string; name: string }} me={user.id} />;
}
