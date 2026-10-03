import { createClient } from '@/lib/supabase/server';
import GuestSignIn from './sign-in';
import Connections from './connections';

export const metadata = { title: 'Connections · Serendine' };

// People you chose to keep in touch with: /connections
export default async function ConnectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <GuestSignIn />;
  return <Connections />;
}
