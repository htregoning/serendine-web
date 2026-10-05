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

// A venue's look by its id (the invite page for a planned night out). Null before update 0019.
export async function venueTheme(venueId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('venues')
    .select('theme_preset, theme_bg, theme_text, theme_accent, theme_font, brand_updated_at')
    .eq('id', venueId)
    .maybeSingle();
  if (error || !data) return { theme: null, logoUrl: null };
  const v = data as {
    theme_preset: string; theme_bg: string; theme_text: string; theme_accent: string; theme_font: ThemeFont;
    brand_updated_at: string;
  };
  // The logo link is always given; the page hides the image if the venue has none (saves loading the logo here).
  return {
    theme: { preset: v.theme_preset, bg: v.theme_bg, fg: v.theme_text, accent: v.theme_accent, font: v.theme_font },
    logoUrl: `/api/logo/${venueId}?v=${Math.floor(new Date(v.brand_updated_at).getTime() / 1000)}`,
  };
}
