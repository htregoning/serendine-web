import StaffSignIn from '../sign-in';
import { venueForPage } from '../venue-for-page';
import Kitchen from './kitchen';

export const metadata = { title: 'Kitchen · Serendine' };

// The kitchen screen for a tablet by the pass: /staff/kitchen?v=<venue-slug>
export default async function KitchenPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const { user, venue } = await venueForPage(v);
  if (!user) return <StaffSignIn />;
  if (!venue) {
    return (
      <main className="shell" style={{ justifyContent: 'center' }}>
        <h1 className="display">No venue linked yet</h1>
      </main>
    );
  }
  return <Kitchen venueId={venue.id} venueName={venue.name} slug={venue.slug} />;
}
