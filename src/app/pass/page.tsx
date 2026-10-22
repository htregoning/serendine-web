import { createClient } from '@/lib/supabase/server';
import SignInCard from '@/components/sign-in-card';
import Logo from '@/components/logo';
import PassScreen from './pass-screen';

export const metadata = { title: 'My pass · Serendine' };

// The guest's Serendine pass: one QR for loyalty at any Serendine venue's counter.
export default async function PassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="shell">
        <div className="brand-lockup" style={{ marginBottom: 4 }}>
          <Logo size={64} />
          <span className="wordmark" style={{ fontSize: 20 }}>Serendine</span>
        </div>
        <h1 className="display">Your Serendine pass</h1>
        <p className="lede">One code for loyalty stamps and rewards at every Serendine venue. Show it at the counter.</p>
        <div style={{ flex: 1 }} />
        <SignInCard next="/pass" title="Sign in to see your pass" />
      </main>
    );
  }
  return <PassScreen />;
}
