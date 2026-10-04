import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import StaffSignIn from '../../staff/sign-in';
import Reports from './reports';

export const metadata = { title: 'Reports · Serendine admin' };

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <StaffSignIn />;
  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  if (!isAdmin) redirect('/admin');
  return <Reports />;
}
