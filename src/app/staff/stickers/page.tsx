import { createClient } from '@/lib/supabase/server';
import StaffSignIn from '../sign-in';
import StickerSheet, { type StickerTable } from './sticker-sheet';

export const metadata = { title: 'Table stickers · Serendine' };

// Printable QR stickers for every table at the venue: /staff/stickers
export default async function StickersPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <StaffSignIn />;

  const { data: rows } = await supabase
    .from('venue_members')
    .select('role, venues(id, slug, name, accent)')
    .eq('user_id', user.id)
    .eq('role', 'manager');

  type Row = { venues: { id: string; slug: string; name: string; accent: string } | null };
  const venues = ((rows ?? []) as unknown as Row[]).map((r) => r.venues).filter((x) => x !== null);
  const venue = venues.find((x) => x.slug === v) ?? venues[0];

  if (!venue) {
    return (
      <main className="shell" style={{ justifyContent: 'center' }}>
        <h1 className="display">Managers only</h1>
        <p className="lede">Sign in with a venue manager account to print table stickers.</p>
      </main>
    );
  }

  const { data: tables } = await supabase
    .from('venue_tables')
    .select('label, zone, qr_token')
    .eq('venue_id', venue.id);

  const sorted = ((tables ?? []) as StickerTable[]).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );

  return <StickerSheet venueName={venue.name} accent={venue.accent} tables={sorted} />;
}
