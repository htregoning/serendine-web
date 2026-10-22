import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DetailsScreen from './details-screen';

export const metadata = { title: 'Your details · Serendine' };

export default async function DetailsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');
  return <DetailsScreen />;
}
