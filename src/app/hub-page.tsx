import type { User } from '@supabase/supabase-js';
import Logo from '@/components/logo';
import SiteFooter from '@/components/site-footer';
import VenueThemeFrame from '@/components/venue-theme-frame';
import type { createClient } from '@/lib/supabase/server';
import HomeHub, { type MyPlace } from './home-hub';
import type { MyPlan } from './plan/plan-screen';

type Client = Awaited<ReturnType<typeof createClient>>;

// A signed-in guest's own page: plans and places they've been. Shown on the home page,
// and at /me (reachable while still checked in at a table, with a way back to it).
export default async function HubPage({ supabase, user, tableToken }: { supabase: Client; user: User; tableToken?: string | null }) {
  const [plans, places] = await Promise.all([supabase.rpc('my_gatherings'), supabase.rpc('my_places')]);
  const name =
    (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? (user.user_metadata?.name as string | undefined)?.split(' ')[0] ?? '';
  return (
    <VenueThemeFrame theme={null}>
      <main className="shell">
        <div className="brand-lockup" style={{ marginBottom: 4 }}>
          <Logo size={56} />
          <span className="wordmark" style={{ fontSize: 18 }}>Serendine</span>
        </div>
        {tableToken && (
          <a className="btn btn-ghost btn-sm" href={`/t/${tableToken}/room`} style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>
            ‹ Back to your table
          </a>
        )}
        <HomeHub
          name={name}
          plans={plans.error ? [] : ((plans.data as MyPlan[] | null) ?? [])}
          places={places.error ? [] : ((places.data as MyPlace[] | null) ?? [])}
          atTable={!!tableToken}
        />
        <SiteFooter />
      </main>
    </VenueThemeFrame>
  );
}
