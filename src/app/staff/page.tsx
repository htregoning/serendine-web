import { createClient } from '@/lib/supabase/server';
import StaffSignIn from './sign-in';
import StaffScreen, { type StaffVenue } from './staff-screen';
import type { ThemeFont } from '@/lib/theme';
import type { ChatMode } from '@/lib/types';

export const metadata = { title: 'Serendine · Staff' };

// The venue's staff screen: /staff (optionally /staff?v=<venue-slug>)
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <StaffSignIn />;

  await supabase.rpc('claim_my_invites');
  const cols = 'id, slug, name, accent, offer_enabled, offer_text, menu_pdf_path, menu_updated_at';
  const first = await supabase
    .from('venue_members')
    .select(`role, venues(${cols}, drinks_enabled, requests_enabled, kind)`)
    .eq('user_id', user.id);
  // Before the latest database updates are installed, load without the newer settings.
  let rows: unknown = first.data;
  if (first.error) {
    const second = await supabase.from('venue_members').select(`role, venues(${cols}, drinks_enabled)`).eq('user_id', user.id);
    rows = second.error
      ? (await supabase.from('venue_members').select(`role, venues(${cols})`).eq('user_id', user.id)).data
      : second.data;
  }

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

  const picked = venues.find((x) => x.slug === v) ?? venues[0];
  // Review, report and birthday settings (after database update 0016).
  const extra = await supabase
    .from('venues')
    .select('google_review_url, instagram_handle, birthday_offer, weekly_report')
    .eq('id', picked.id)
    .maybeSingle();
  let venue: StaffVenue = extra.error || !extra.data ? picked : { ...picked, ...(extra.data as Partial<StaffVenue>) };
  // The venue's look and chat modes (after database update 0019).
  const look = await supabase
    .from('venues')
    .select('theme_preset, theme_bg, theme_text, theme_accent, theme_font, allowed_modes, brand_updated_at')
    .eq('id', picked.id)
    .maybeSingle();
  if (!look.error && look.data) {
    const l = look.data as {
      theme_preset: string; theme_bg: string; theme_text: string; theme_accent: string;
      theme_font: ThemeFont; allowed_modes: ChatMode[]; brand_updated_at: string;
    };
    venue = {
      ...venue,
      brand: {
        theme: { preset: l.theme_preset, bg: l.theme_bg, fg: l.theme_text, accent: l.theme_accent, font: l.theme_font },
        modes: l.allowed_modes,
        logoUrl: `/api/logo/${picked.id}?v=${Math.floor(new Date(l.brand_updated_at).getTime() / 1000)}`,
      },
    };
  }
  // AI host settings (after database update 0018).
  const host = await supabase.from('venues').select('host_enabled, host_tone').eq('id', picked.id).maybeSingle();
  if (!host.error && host.data) venue = { ...venue, ...(host.data as Partial<StaffVenue>) };
  return <StaffScreen venue={venue} />;
}
