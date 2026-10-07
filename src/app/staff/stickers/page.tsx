import { createClient } from '@/lib/supabase/server';
import StaffSignIn from '../sign-in';
import StickerSheet, { DEFAULT_DESIGN, type StickerDesign, type StickerTable } from './sticker-sheet';

export const metadata = { title: 'Table stickers · Serendine' };

type V = { id: string; slug: string; name: string; accent: string };

// Printable QR stickers for every table at a venue: /staff/stickers?v=<slug>
// For the venue's managers and the Serendine admin.
export default async function StickersPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <StaffSignIn />;

  let venue: V | null = null;
  if (v) {
    const { data } = await supabase.from('venues').select('id, slug, name, accent').eq('slug', v).maybeSingle();
    venue = (data as V | null) ?? null;
  } else {
    const { data: rows } = await supabase
      .from('venue_members')
      .select('venues(id, slug, name, accent)')
      .eq('user_id', user.id)
      .eq('role', 'manager');
    const mine = ((rows ?? []) as unknown as { venues: V | null }[]).flatMap((r) => (r.venues ? [r.venues] : []));
    if (mine.length > 1) {
      return (
        <main className="shell">
          <h1 className="display" style={{ fontSize: 28 }}>Which venue&apos;s stickers?</h1>
          <div className="col" style={{ gap: 8 }}>
            {mine
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((x) => (
                <a key={x.id} className="card row" href={`/staff/stickers?v=${encodeURIComponent(x.slug)}`} style={{ textDecoration: 'none', color: 'var(--text)' }}>
                  <strong className="grow">{x.name}</strong>
                  <span aria-hidden="true">›</span>
                </a>
              ))}
          </div>
        </main>
      );
    }
    venue = mine[0] ?? null;
  }

  const { data: tables } = venue ? await supabase.rpc('admin_tables', { v: venue.id }) : { data: null };
  const list = (tables as StickerTable[] | null) ?? [];

  if (!venue || list.length === 0) {
    return (
      <main className="shell" style={{ justifyContent: 'center' }}>
        <h1 className="display">Managers only</h1>
        <p className="lede">Sign in with a manager account for this venue to print its table stickers.</p>
      </main>
    );
  }

  // The venue's saved design (falls back to the Serendine style before the 0010 update).
  const { data: design, error: designError } = await supabase.rpc('venue_sticker', { v: venue.id });
  const saved = ((design as StickerDesign[] | null) ?? [])[0];
  const initial: StickerDesign = saved ? { ...DEFAULT_DESIGN, ...saved, sub: saved.sub ?? '' } : DEFAULT_DESIGN;

  // The guest app's colours (after update 0019), for "Match our app look".
  const { data: lookRow, error: lookErr } = await supabase
    .from('venues')
    .select('theme_preset, theme_bg, theme_text, theme_accent')
    .eq('id', venue.id)
    .maybeSingle();
  const look = lookErr || !lookRow
    ? null
    : (() => {
        const l = lookRow as { theme_preset: string; theme_bg: string; theme_text: string; theme_accent: string };
        return l.theme_preset === 'serendine' ? null : { bg: l.theme_bg, fg: l.theme_text, accent: l.theme_accent };
      })();

  const { data: kindRow } = await supabase.from('venues').select('kind').eq('id', venue.id).maybeSingle();
  const isEvent = (kindRow as { kind?: string } | null)?.kind === 'event';

  const sorted = list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return (
    <StickerSheet
      venueId={venue.id}
      venueName={venue.name}
      venueSlug={venue.slug}
      tables={sorted}
      initial={initial}
      canSave={!designError}
      isEvent={isEvent}
      appLook={look}
    />
  );
}
