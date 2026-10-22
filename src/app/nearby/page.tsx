import { createClient } from '@/lib/supabase/server';
import SignInCard from '@/components/sign-in-card';
import Logo from '@/components/logo';
import VenueThemeFrame from '@/components/venue-theme-frame';
import NearbyScreen from './nearby-screen';

export const metadata = { title: 'Chat nearby · Serendine' };

// Neighbourhood rooms: chat with people in your part of town. Exact locations are never shared.
export default async function NearbyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <VenueThemeFrame theme={null}>
      {user ? (
        <NearbyScreen />
      ) : (
        <main className="shell">
          <div className="brand-lockup" style={{ marginBottom: 4 }}>
            <Logo size={64} />
            <span className="wordmark" style={{ fontSize: 20 }}>Serendine</span>
          </div>
          <h1 className="display">Chat nearby</h1>
          <p className="lede">
            Talk to people in your neighbourhood (Dubai Marina, JLT, Downtown…) and the areas next to it. Nobody ever sees exactly where you are.
          </p>
          <div style={{ flex: 1 }} />
          <SignInCard next="/nearby" title="Sign in to join your neighbourhood" lede="18+ only." />
        </main>
      )}
    </VenueThemeFrame>
  );
}
