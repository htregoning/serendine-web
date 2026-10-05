import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { venueTheme } from '@/lib/venue-server';
import VenueThemeFrame from '@/components/venue-theme-frame';
import { when, type Gathering } from '@/lib/gatherings';
import GatheringView from './gathering-view';

type Params = { params: Promise<{ code: string }> };

async function load(code: string) {
  if (!/^[0-9a-f]{10}$/.test(code)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc('gathering_by_code', { p_code: code });
  return ((data as Gathering[] | null) ?? [])[0] ?? null;
}

// What WhatsApp shows when the link is shared.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const g = await load(code);
  if (!g) return { title: 'Serendine' };
  const title = `${g.title} · ${g.venue_name}`;
  const description = `${when(g.starts_at)}. ${g.organiser_name ?? 'A friend'} invited you. Tap to say if you're in.`;
  return { title, description, openGraph: { title, description, siteName: 'Serendine', type: 'website' } };
}

// The invite page friends open from WhatsApp: /g/<code>
export default async function GatheringPage({ params, searchParams }: Params & { searchParams: Promise<{ new?: string }> }) {
  const { code } = await params;
  const { new: isNew } = await searchParams;
  const g = await load(code);
  if (!g) return notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { theme, logoUrl } = await venueTheme(g.venue_id);
  const name =
    (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? (user?.user_metadata?.name as string | undefined)?.split(' ')[0] ?? '';
  return (
    <VenueThemeFrame theme={theme}>
      <GatheringView initial={g} signedIn={!!user} logoUrl={logoUrl} justCreated={isNew === '1'} defaultName={name} />
    </VenueThemeFrame>
  );
}
