import { createClient } from '@/lib/supabase/server';
import StaffSignIn from '../../staff/sign-in';
import WorkTheme from '@/components/work-theme';
import PassStaff from './pass-staff';

export const metadata = { title: 'Serendine pass · Staff', robots: { index: false, follow: false } };

type V = { venue_id: string; venue_slug: string; venue_name: string; guest_name: string };

// What staff see when they scan a guest's pass with their phone camera: /s/<code>
export default async function PassScanPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ v?: string }> }) {
  const { code } = await params;
  const { v } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <StaffSignIn />;

  const { data, error } = await supabase.rpc('staff_pass_venues', { p_code: code });
  const venues = (data as V[] | null) ?? [];
  const picked = venues.find((x) => x.venue_slug === v) ?? (venues.length === 1 ? venues[0] : null);

  return (
    <>
      <WorkTheme />
      {error || venues.length === 0 ? (
        <main className="shell" style={{ justifyContent: 'center' }}>
          <h1 className="display" style={{ fontSize: 26 }}>This is a Serendine pass</h1>
          <p className="lede">
            It&apos;s scanned by staff at Serendine venues to add loyalty stamps. If you work at one, sign in with your staff account; the pass
            belongs to the guest who showed it to you.
          </p>
          <a className="btn btn-ghost" href="/pass" style={{ textDecoration: 'none' }}>Your own pass</a>
        </main>
      ) : !picked ? (
        <main className="shell">
          <h1 className="display" style={{ fontSize: 26 }}>Which venue are you at?</h1>
          <div className="col" style={{ gap: 8 }}>
            {venues.map((x) => (
              <a key={x.venue_id} className="card row" href={`/s/${encodeURIComponent(code)}?v=${encodeURIComponent(x.venue_slug)}`} style={{ textDecoration: 'none', color: 'var(--text)' }}>
                <strong className="grow">{x.venue_name}</strong>
                <span aria-hidden="true">›</span>
              </a>
            ))}
          </div>
        </main>
      ) : (
        <PassStaff code={code} venueId={picked.venue_id} venueName={picked.venue_name} venueSlug={picked.venue_slug} />
      )}
    </>
  );
}
