import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import StaffSignIn from '../../staff/sign-in';
import MarketingFiles from './marketing-files';

export const metadata = { title: 'Directory · Serendine admin', robots: { index: false, follow: false } };

type Item = { href: string; label: string; note: string; external?: boolean };

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Guest pages',
    items: [
      { href: '/', label: 'Home page', note: 'serendine.com, with contact links and the footer' },
      { href: '/connections', label: 'Connections', note: 'People a guest kept in touch with after leaving' },
      { href: '/privacy', label: 'Privacy Policy', note: 'Linked from the footer and check-in screen' },
      { href: '/terms', label: 'Terms and Conditions', note: 'Linked from the footer and sign-in' },
      { href: '/tg', label: 'Telegram mini app', note: 'Where the Telegram bot opens (once set up)' },
    ],
  },
  {
    title: 'Venue staff and managers',
    items: [
      { href: '/staff', label: 'Staff screen', note: 'Requests, drinks to send, messaging guests, manager settings' },
      { href: '/staff/guests', label: 'Guest list', note: 'Who came in, visit history, notes, downloads' },
      { href: '/staff/stickers', label: 'QR codes and stickers', note: 'Design, print and download table codes' },
    ],
  },
  {
    title: 'Serendine admin',
    items: [
      { href: '/admin', label: 'Venues and events', note: 'Add restaurants and events, tables, team' },
      { href: '/admin/reports', label: 'Reports', note: 'Reported guests and bans' },
      { href: '/staff/push-keys', label: 'Notification keys', note: 'One-off key maker (already done)' },
      { href: '/api/telegram/setup', label: 'Connect Telegram bot', note: 'Run once after adding the bot token in Vercel' },
    ],
  },
  {
    title: 'Behind the scenes',
    items: [
      { href: 'https://supabase.com/dashboard/project/cyjfqrwdnwebdkohwsdw', label: 'Supabase', note: 'Database, sign-in settings, SQL Editor, users', external: true },
      { href: 'https://vercel.com/dashboard', label: 'Vercel', note: 'Website hosting, domain, DNS records, settings', external: true },
      { href: 'https://console.cloud.google.com/apis/credentials/consent', label: 'Google Cloud', note: 'Google sign-in branding and publishing', external: true },
      { href: 'https://search.google.com/search-console', label: 'Google Search Console', note: 'Proof you own serendine.com', external: true },
      { href: 'https://resend.com/domains', label: 'Resend', note: 'Sign-in emails from hello@serendine.com', external: true },
      { href: 'https://github.com/htregoning/serendine-web', label: 'GitHub', note: 'The code (serendine-web)', external: true },
      { href: 'https://instagram.com/serendiners', label: 'Instagram', note: '@serendiners', external: true },
    ],
  },
  {
    title: 'Marketing material (in Claude)',
    items: [
      { href: 'https://claude.ai/artifact/4TRT1DDUVzyh87ZPGW5Zsd', label: 'Restaurant pitch deck', note: 'The deck to show venues, navy and pink', external: true },
      { href: 'https://claude.ai/artifact/3BC9sZdBG28nK7T7iV2Lr8', label: 'Pricing slides', note: 'Plans, events and projected income', external: true },
      { href: 'https://claude.ai/artifact/96RfLqNndvtxVXTbcRDW5A', label: 'Design prototype', note: 'Early clickable designs and sticker mock-ups', external: true },
      { href: 'https://claude.ai/artifact/KVRC2MMe8pRDwUT2N7HCWF', label: 'Logo', note: 'The Serendine logo artwork', external: true },
    ],
  },
];

// A private page listing every part of Serendine, for the admin only. Not linked anywhere public.
export default async function DirectoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <StaffSignIn />;
  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  if (!isAdmin) {
    return (
      <main className="shell" style={{ justifyContent: 'center' }}>
        <h1 className="display">Not found</h1>
        <p className="lede"><Link href="/">Back to Serendine</Link></p>
      </main>
    );
  }

  return (
    <main className="admin">
      <header className="admin-head">
        <Link href="/admin" className="small">← Admin</Link>
      </header>
      <h1 className="display" style={{ fontSize: 30 }}>Directory</h1>
      <p className="small">
        Everything in one place. Bookmark serendine.com/admin/directory. Only you can open it. Links to Claude open for you
        only until you share them.
      </p>

      <div className="dir-grid">
        {SECTIONS.map((s) => (
          <section key={s.title} className="card col" style={{ gap: 4 }}>
            <h2 className="dir-title">{s.title}</h2>
            {s.items.map((i) => (
              <a
                key={i.href}
                className="dir-item"
                href={i.href}
                {...(i.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                <span className="dir-label">{i.label}{i.external ? ' ↗' : ''}</span>
                <span className="small">{i.note}</span>
              </a>
            ))}
          </section>
        ))}
      </div>

      <MarketingFiles />
    </main>
  );
}
