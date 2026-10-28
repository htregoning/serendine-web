import { redirect } from 'next/navigation';
import Logo from '@/components/logo';
import SiteFooter from '@/components/site-footer';
import { createClient } from '@/lib/supabase/server';
import SignInCard from '@/components/sign-in-card';
import HubPage from './hub-page';
import HomeIcon from './home-icons';

const GUEST: [string, string, string][] = [
  ['people', 'Meet people', 'Say hello to other tables, only if both of you want to.'],
  ['gift', 'Loyalty', 'Stamps and rewards on your phone, at every Serendine venue.'],
  ['party', 'Events', 'Group nights, offers for bigger tables and events near you.'],
  ['order', 'Orders', 'Order, call a waiter or ask for the bill from your table.'],
];

const VENUE: [string, string, string][] = [
  ['gift', 'Loyalty schemes', 'Visit rewards, stamp cards and a pass for takeaway customers.'],
  ['order', 'Ordering', 'Orders and requests from the table, straight to staff and the kitchen.'],
  ['megaphone', 'Venue communications', 'Specials, last orders and news to everyone in the room.'],
  ['party', 'Events', 'Group bookings with offers, and events with their own guest list.'],
  ['know', 'Know your customer', 'Your own guest list: names, contact details, visits and birthdays, with consent.'],
  ['chart', 'Statistics', 'New and returning guests, busiest times, ages and ratings. Download any period.'],
];

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

    // Signed in and not at a table: their own page (plans, places they've been).
    return <HubPage supabase={supabase} user={user} />;
  }

  return (
    <main className="shell home">
      {/* For guests */}
      <div className="brand-lockup" style={{ marginTop: 8 }}>
        <Logo size={96} />
        <span className="wordmark" style={{ fontSize: 24 }}>Serendine</span>
      </div>
      <h1 className="display">Someone in this room might be worth meeting.</h1>
      <p className="lede">
        Book a table, meet people at other tables, collect loyalty rewards and order from your phone. Scan the code on your table to start.
      </p>

      <a className="btn btn-primary home-pass" href="/pass">
        <HomeIcon name="qr" size={24} />
        Show my loyalty pass
      </a>
      <p className="small" style={{ margin: '-10px 0 0', textAlign: 'center' }}>Show it at the counter to collect stamps and rewards.</p>

      <div className="card" style={{ width: '100%' }}>
        <SignInCard next="/" title="Sign in to your account" lede="Your bookings, loyalty cards and the places you've been." />
      </div>

      <ul className="home-tiles" aria-label="What you can do">
        <li className="home-tile home-tile-wide">
          <a href="/plan">
            <HomeIcon name="calendar" />
            <span><strong>Book a table</strong>
              <span className="small">Pick a venue, invite friends on WhatsApp and the venue confirms. Book now →</span></span>
          </a>
        </li>
        {GUEST.map(([icon, title, text]) => (
          <li key={title} className="home-tile">
            <HomeIcon name={icon} />
            <span><strong>{title}</strong><span className="small">{text}</span></span>
          </li>
        ))}
      </ul>

      {/* For venues */}
      <section className="home-biz" aria-labelledby="biz-title">
        <span className="eyebrow">For restaurants, bars and cafés</span>
        <h2 id="biz-title" className="display">Everything your venue needs, on every table</h2>
        <ul className="home-tiles">
          {VENUE.map(([icon, title, text]) => (
            <li key={title} className="home-tile">
              <HomeIcon name={icon} />
              <span><strong>{title}</strong><span className="small">{text}</span></span>
            </li>
          ))}
        </ul>
        <p className="lede" style={{ textAlign: 'center' }}>First month free. Nothing for guests to download.</p>
        <div className="home-contact">
          <strong>See it working</strong>
          <span className="small">We&apos;ll come and show you Serendine on your own tables, or answer any questions.</span>
          <a className="btn btn-primary" style={{ textDecoration: 'none', width: '100%' }}
             href="https://wa.me/971553364111?text=Hi%2C%20I%27d%20like%20a%20demo%20of%20Serendine%20for%20my%20venue."
             target="_blank" rel="noopener noreferrer">
            Ask for a demo on WhatsApp
          </a>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a className="btn btn-ghost btn-sm" href="mailto:serendiners@gmail.com?subject=More%20information%20about%20Serendine">
              Email for more information
            </a>
            <a className="btn btn-ghost btn-sm" href="https://instagram.com/serendiners" target="_blank" rel="noopener noreferrer">
              Instagram @serendiners
            </a>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
