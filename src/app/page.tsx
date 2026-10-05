import { redirect } from 'next/navigation';
import Logo from '@/components/logo';
import SiteFooter from '@/components/site-footer';
import { createClient } from '@/lib/supabase/server';
import SignInCard from '@/components/sign-in-card';
import HubPage from './hub-page';

// Opening Serendine from the home screen takes a checked-in guest straight back to their room.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: token } = await supabase.rpc('my_active_table_token');
    if (typeof token === 'string' && token) redirect(`/t/${token}/room`);
    // Left without rating (or was checked out automatically): ask once.
    const { data: pending } = await supabase.rpc('pending_feedback');
    if (typeof pending === 'string' && pending) redirect(`/thanks/${pending}`);

    // Signed in and not at a table: their own page (plans, places they've been).
    return <HubPage supabase={supabase} user={user} />;
  }

  return (
    <main className="shell">
      <div style={{ flex: 1 }} />
      <div className="brand-lockup" style={{ marginBottom: 12 }}>
        <Logo size={120} />
        <span className="wordmark" style={{ fontSize: 26 }}>Serendine</span>
      </div>
      <h1 className="display">Someone in this room might be worth meeting.</h1>
      <p className="lede">
        Scan the code on your table to say hello to another table, call a waiter or see the menu.
      </p>
      <a className="btn btn-primary" href="/plan" style={{ textDecoration: 'none' }}>Plan a night out with friends</a>
      <div className="card" style={{ width: '100%' }}>
        <SignInCard next="/" title="Sign in" lede="See the places you've been, rate your visits and plan nights out with friends." />
      </div>
      <div className="home-contact">
        <span className="small">Run a restaurant or bar? Bring Serendine to your tables.</span>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a className="btn btn-ghost btn-sm" href="mailto:serendiners@gmail.com?subject=Serendine%20for%20my%20venue">
            serendiners@gmail.com
          </a>
          <a className="btn btn-ghost btn-sm" href="https://instagram.com/serendiners" target="_blank" rel="noopener noreferrer">
            Instagram @serendiners
          </a>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
