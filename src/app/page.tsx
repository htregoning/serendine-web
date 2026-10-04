import { redirect } from 'next/navigation';
import Logo from '@/components/logo';
import SiteFooter from '@/components/site-footer';
import { createClient } from '@/lib/supabase/server';

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
      <p className="small">
        <a href="/connections">Your connections</a>
      </p>
      <SiteFooter />
    </main>
  );
}
