import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { visitTheme } from '@/lib/venue-server';
import VenueThemeFrame from '@/components/venue-theme-frame';
import Thanks, { type FeedbackInfo } from './thanks';

export const metadata = { title: 'How was it? · Serendine' };

// Shown when a guest leaves (and next time they open Serendine if they didn't answer).
export default async function ThanksPage({ params }: { params: Promise<{ visit: string }> }) {
  const { visit } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data, error } = await supabase.rpc('feedback_info', { p_visit: visit });
  const info = ((data as FeedbackInfo[] | null) ?? [])[0];
  if (error || !info) redirect('/');
  const theme = await visitTheme(visit);
  return (
    <VenueThemeFrame theme={theme}>
      <Thanks visitId={visit} info={info} />
    </VenueThemeFrame>
  );
}
