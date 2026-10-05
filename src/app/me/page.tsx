import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import HubPage from '../hub-page';

export const metadata = { title: 'Your places and plans · Serendine' };

// Your own page, reachable while you're still checked in at a table (the home page sends you back to it).
export default async function MePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: token } = await supabase.rpc('my_active_table_token');
  return <HubPage supabase={supabase} user={user} tableToken={typeof token === 'string' && token ? token : null} />;
}
