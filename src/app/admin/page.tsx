import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import StaffSignIn from '../staff/sign-in';
import AdminHome, { type AdminVenue } from './admin-home';

export const metadata = { title: 'Admin · Serendine' };

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <StaffSignIn />;

  await supabase.rpc('claim_my_invites');
  const [{ data: isAdmin }, { data: venues }] = await Promise.all([
    supabase.rpc('is_platform_admin'),
    supabase.rpc('admin_venues'),
  ]);
  const list = (venues as AdminVenue[] | null) ?? [];

  if (!isAdmin && list.length === 0) {
    return (
      <main className="shell" style={{ justifyContent: 'center' }}>
        <h1 className="display">No access</h1>
        <p className="lede">
          You&apos;re signed in as {user.email}. This page is for Serendine and venue managers. Staff can use the{' '}
          <Link href="/staff">staff screen</Link>.
        </p>
      </main>
    );
  }

  return <AdminHome isAdmin={isAdmin === true} venues={list} email={user.email ?? ''} />;
}
