import { createClient } from '@/lib/supabase/server';
import StaffSignIn from '../sign-in';
import { venueForPage } from '../venue-for-page';
import MenuEditor from './menu-editor';
import type { MenuItem } from '@/lib/orders';

export const metadata = { title: 'Menu · Serendine' };

// The venue's menu for ordering from the table: /staff/menu?v=<venue-slug>
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, category, name, description, price, available, sort')
    .eq('venue_id', venue.id)
    .order('sort');
  if (error) {
    return (
      <main className="shell" style={{ justifyContent: 'center' }}>
        <h1 className="display">Almost there</h1>
        <p className="lede">Ordering needs database update 0024. Run it in Supabase, then come back.</p>
      </main>
    );
  }
  return <MenuEditor venue={venue} initial={(data as MenuItem[]) ?? []} />;
}
