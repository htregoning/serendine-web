import { createClient } from '@/lib/supabase/server';
import StaffSignIn from './sign-in';
import StaffScreen, { type StaffVenue } from './staff-screen';

export const metadata = { title: 'Serendine · Staff' };

// The venue's staff screen: /staff (optionally /staff?v=<venue-slug>)
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <StaffSignIn />;

  const cols = 'id, slug, name, accent, offer_enabled, offer_text, menu_pdf_path, menu_updated_at';
  let { data: rows, error } = await supabase
    .from('venue_members')
    .select(`role, venues(${cols}, drinks_enabled)`)
    .eq('user_id', user.id);
  // Before the drinks database update is installed, load without that setting.
  if (error) ({ data: rows } = await supabase.from('venue_members').select(`role, venues(${cols})`).eq('user_id', user.id));

  type Row = { role: 'manager' | 'staff'; venues: Omit<StaffVenue, 'role'> | null };
  const venues: StaffVenue[] = ((rows ?? []) as unknown as Row[])
    .filter((r) => r.venues)
    .map((r) => ({ ...(r.venues as Omit<StaffVenue, 'role'>), role: r.role }));

  if (venues.length === 0) {
    return (
      <main className="shell" style={{ justifyContent: 'center' }}>
        <h1 className="display">No venue linked yet</h1>
        <p className="lede">
          You&apos;re signed in as {user.email}, but this account isn&apos;t a manager or staff member of any venue.
        </p>
      </main>
    );
  }

  const venue = venues.find((x) => x.slug === v) ?? venues[0];
  return <StaffScreen venue={venue} />;
}
