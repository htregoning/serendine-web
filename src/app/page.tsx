import { redirect } from 'next/navigation';
import Logo from '@/components/logo';
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
  }

  return (
    <main className="shell" style={{ justifyContent: 'center' }}>
      <div className="brand-lockup" style={{ marginBottom: 12 }}>
        <Logo size={120} />
        <span className="wordmark" style={{ fontSize: 26 }}>Serendine</span>
      </div>
      <h1 className="display">Someone in this room might be worth meeting.</h1>
      <p className="lede">
        Scan the code on your table to say hello to another table, call a waiter or see the menu.
      </p>
      <p className="small">For venues: get in touch to bring Serendine to your tables.</p>
      <p className="small">
        <a href="/connections">Your connections</a> · <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of use</a>
      </p>
    </main>
  );
}
