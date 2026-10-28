'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { STATUS_TEXT, when } from '@/lib/gatherings';
import type { MyPlan } from '@/app/plan/plan-screen';
import InstallApp from '@/components/install-app';
import ProfileForm, { useMyProfile } from '@/components/profile-form';
import LoyaltyCards from '@/components/loyalty-cards';

export type MyPlace = {
  visit_id: string;
  venue_name: string;
  venue_slug: string;
  kind: string;
  place: string | null;
  started_at: string;
  ended_at: string | null;
  rating: number | null;
  has_comment: boolean;
  can_rate: boolean;
  groups_enabled: boolean;
};

function day(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// A signed-in guest's own page: plans, places they've been, ratings, connections.
export default function HomeHub({ name, plans, places, atTable = false }: { name: string; plans: MyPlan[]; places: MyPlace[]; atTable?: boolean }) {
  const [supabase] = useState(() => createClient());
  const upcoming = plans.filter((p) => new Date(p.starts_at).getTime() > Date.now() - 6 * 3600000 && p.status !== 'cancelled');

  const [profile, setProfile] = useMyProfile();

  // One row per place, most recent first, however many times they've been.
  const venues: { visits: MyPlace[] }[] = [];
  const seen = new Map<string, { visits: MyPlace[] }>();
  for (const p of places) {
    const g = seen.get(p.venue_slug);
    if (g) g.visits.push(p);
    else {
      const n = { visits: [p] };
      seen.set(p.venue_slug, n);
      venues.push(n);
    }
  }

  // Signing out always lands on the Serendine home page.
  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign('/');
  }

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="col" style={{ gap: 6 }}>
        <h1 className="display" style={{ fontSize: 30 }}>{name ? `Hello, ${name}` : 'Hello'}</h1>
        <p className="lede">At a restaurant? Scan the code on your table. Planning ahead? Start a night out and invite friends.</p>
      </div>

      {profile && !profile.complete && (
        <div className="card">
          <ProfileForm
            initial={profile}
            onSaved={setProfile}
            title="A few details, just once"
            lede="Saved for every Serendine venue, so you never type them again. Never shown to other guests."
            submitLabel="Save my details"
          />
        </div>
      )}

      <div className="row" style={{ gap: 10 }}>
        <a className="btn btn-primary grow" href="/plan" style={{ textDecoration: 'none' }}>Plan a night out</a>
        <a className="btn btn-ghost grow" href="/pass" style={{ textDecoration: 'none' }}>Loyalty pass</a>
      </div>
      <a className="btn btn-ghost" href="/nearby" style={{ textDecoration: 'none' }}>Chat nearby: your neighbourhood&apos;s room</a>

      {upcoming.length > 0 && (
        <section className="col" style={{ gap: 0 }} aria-label="Your plans">
          <span className="eyebrow" style={{ paddingBottom: 6 }}>Your plans</span>
          {upcoming.map((p) => (
            <a key={p.code} href={`/g/${p.code}`} className="row person-row plan-row">
              <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                <strong>{p.title}</strong>
                <span className="small">{p.venue_name} · {when(p.starts_at)} · {p.going} going</span>
                <span className="small" style={{ color: p.status === 'confirmed' ? 'var(--good)' : 'var(--muted)' }}>{STATUS_TEXT[p.status]}</span>
              </div>
              <span aria-hidden="true">›</span>
            </a>
          ))}
        </section>
      )}

      <LoyaltyCards supabase={supabase} showVenue />

      <section className="col" style={{ gap: 0 }} aria-label="Places you've been">
        <span className="eyebrow" style={{ paddingBottom: 6 }}>Places you&apos;ve been</span>
        {places.length === 0 && (
          <p className="small" style={{ margin: 0 }}>Nowhere yet. Scan a Serendine code at a restaurant, bar or event and it&apos;ll show here.</p>
        )}
        {venues.map((g) => {
          const last = g.visits[0];
          const rated = g.visits.find((p) => p.rating);
          const toRate = g.visits.find((p) => p.can_rate && !p.rating && p.ended_at);
          return (
            <div key={last.venue_slug} className="row person-row">
              <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                <strong>{last.venue_name}</strong>
                <span className="small">
                  {!last.ended_at ? 'You’re here now' : `Last visit ${day(last.started_at)}`}
                  {last.place ? ` · ${last.place}` : ''}
                </span>
                <span className="small">
                  {g.visits.length === 1 ? '1 visit' : `${g.visits.length} visits`}
                  {rated?.rating ? (
                    <span aria-label={` · you last rated it ${rated.rating} out of 5`}>
                      {' · '}
                      <span style={{ color: 'var(--accent)', letterSpacing: 1 }}>{'★'.repeat(rated.rating)}</span>
                      <span style={{ opacity: 0.35, letterSpacing: 1 }}>{'★'.repeat(5 - rated.rating)}</span>
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="col" style={{ gap: 6, alignItems: 'flex-end' }}>
                {toRate && (
                  <a className="btn btn-outline btn-sm" href={`/thanks/${toRate.visit_id}`} style={{ textDecoration: 'none' }}>Rate it</a>
                )}
                {last.groups_enabled && (
                  <a className="small" href={`/plan?v=${encodeURIComponent(last.venue_slug)}`}>Plan a night here</a>
                )}
              </div>
            </div>
          );
        })}
        {places.some((p) => p.can_rate && !p.rating) && (
          <span className="small" style={{ paddingTop: 8 }}>
            Ratings and notes go privately to the venue, so they can make the next visit better. You have two weeks after a visit.
          </span>
        )}
      </section>

      <InstallApp />

      <div className="row" style={{ gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <a className="btn btn-ghost btn-sm" href="/connections" style={{ textDecoration: 'none' }}>Your connections</a>
        <a className="btn btn-ghost btn-sm" href="/me/details" style={{ textDecoration: 'none' }}>Your details</a>
        {!atTable && <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>}
      </div>
    </div>
  );
}
