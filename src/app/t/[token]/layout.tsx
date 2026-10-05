import type { Viewport } from 'next';
import { venueAtTable } from '@/lib/venue-server';
import { themeVars } from '@/lib/theme';
import VenueThemeFrame from '@/components/venue-theme-frame';

type Params = { params: Promise<{ token: string }> };

// The browser bar takes the venue's background colour too.
export async function generateViewport({ params }: Params): Promise<Viewport> {
  const { token } = await params;
  const venue = await venueAtTable(token);
  return { themeColor: themeVars(venue?.theme)?.['--bg'] ?? '#0B1A3A' };
}

// Every screen a guest sees after scanning wears the venue's look, with Serendine kept small.
export default async function TableLayout({ children, params }: { children: React.ReactNode } & Params) {
  const { token } = await params;
  const venue = await venueAtTable(token);
  return <VenueThemeFrame theme={venue?.theme}>{children}</VenueThemeFrame>;
}
