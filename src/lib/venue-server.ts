import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { ChatMode, VenueAtTable } from '@/lib/types';
import type { ThemeFont } from '@/lib/theme';

type ThemeRow = {
  preset: string;
  bg: string;
  fg: string;
  accent: string;
  font: ThemeFont;
  has_logo: boolean;
  brand_version: number;
  allowed_modes: ChatMode[];
};

// The venue behind a table's QR code, with its look. Looked up once per request
// (the layout and the page both ask for it).
export const venueAtTable = cache(async (token: string): Promise<VenueAtTable | null> => {
  const supabase = await createClient();
  const [{ data }, theme] = await Promise.all([
    supabase.rpc('resolve_table', { token }),
    supabase.rpc('venue_theme', { token }), // missing before update 0019: guests just see the Serendine look
  ]);
  const venue = (Array.isArray(data) ? data[0] : null) as VenueAtTable | null;
  if (!venue) return null;
  const t = theme.error ? null : ((theme.data as ThemeRow[] | null) ?? [])[0];
  if (!t) return venue;
  return {
    ...venue,
    theme: { preset: t.preset, bg: t.bg, fg: t.fg, accent: t.accent, font: t.font },
    logo_url: t.has_logo ? `/api/logo/${venue.venue_id}?v=${t.brand_version}` : null,
    allowed_modes: t.allowed_modes,
  };
});

// The venue's look for a past visit (the "how was it?" page). Null before update 0019.
export async function visitTheme(visitId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('visit_theme', { p_visit: visitId });
  const t = error ? null : ((data as ThemeRow[] | null) ?? [])[0];
  return t ? { preset: t.preset, bg: t.bg, fg: t.fg, accent: t.accent, font: t.font } : null;
}
