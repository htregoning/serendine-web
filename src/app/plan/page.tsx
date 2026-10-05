import { createClient } from '@/lib/supabase/server';
import SignInCard from '@/components/sign-in-card';
import Logo from '@/components/logo';
import PlanScreen, { type BookableVenue, type MyPlan } from './plan-screen';

export const metadata = {
  title: 'Plan a night out · Serendine',
  description: 'Pick a place, invite your friends on WhatsApp, and the venue confirms your table.',
};

// Plan a night out at a Serendine venue: /plan (optionally ?v=<venue-slug> to start at one venue)
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: venues, error } = await supabase.rpc('bookable_venues');

  if (!user) {
    return (
      <main className="shell">
        <div className="brand-lockup" style={{ marginBottom: 4 }}>
          <Logo size={64} />
          <span className="wordmark" style={{ fontSize: 20 }}>Serendine</span>
        </div>
        <h1 className="display">Plan a night out</h1>
        <p className="lede">
          Pick a place, choose a time, and send your friends one link on WhatsApp. The venue confirms your table, and everyone sees
          who&apos;s coming.
        </p>
        <div style={{ flex: 1 }} />
        <SignInCard next={v ? `/plan?v=${encodeURIComponent(v)}` : '/plan'} title="Sign in to start a plan" />
      </main>
    );
  }

  const [{ data: mine }, { data: token }] = await Promise.all([supabase.rpc('my_gatherings'), supabase.rpc('my_active_table_token')]);
  const atTable = typeof token === 'string' && token;
  const name =
    (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? (user.user_metadata?.name as string | undefined)?.split(' ')[0] ?? '';

  return (
    <PlanScreen
      venues={error ? [] : ((venues as BookableVenue[] | null) ?? [])}
      mine={(mine as MyPlan[] | null) ?? []}
      startVenue={v ?? null}
      defaultName={name}
      backHref={atTable ? `/t/${token}/room` : '/'}
      backLabel={atTable ? 'Back to your table' : 'Home'}
    />
  );
}
