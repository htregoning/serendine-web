'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { STATUS_TEXT, when } from '@/lib/gatherings';
import type { MyPlan } from '@/app/plan/plan-screen';

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
export default function HomeHub({ name, plans, places }: { name: string; plans: MyPlan[]; places: MyPlace[] }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const upcoming = plans.filter((p) => new Date(p.starts_at).getTime() > Date.now() - 6 * 3600000 && p.status !== 'cancelled');

  async function signOut() {
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="col" style={{ gap: 6 }}>
        <h1 className="display" style={{ fontSize: 30 }}>{name ? `Hello, ${name}` : 'Hello'}</h1>
        <p className="lede">At a restaurant? Scan the code on your table. Planning ahead? Start a night out and invite friends.</p>
      </div>

      <a className="btn btn-primary" href="/plan" style={{ textDecoration: 'none' }}>Plan a night out</a>

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

      <section className="col" style={{ gap: 0 }} aria-label="Places you've been">
        <span className="eyebrow" style={{ paddingBottom: 6 }}>Places you&apos;ve been</span>
        {places.length === 0 && (
          <p className="small" style={{ margin: 0 }}>Nowhere yet. Scan a Serendine code at a restaurant, bar or event and it&apos;ll show here.</p>
        )}
        {places.map((p) => (
          <div key={p.visit_id} className="row person-row">
            <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
              <strong>{p.venue_name}</strong>
              <span className="small">
                {day(p.started_at)}
                {p.place ? ` · ${p.place}` : ''}
                {!p.ended_at ? ' · here now' : ''}
              </span>
              {p.rating ? (
                <span className="small" aria-label={`You rated it ${p.rating} out of 5`}>
                  <span style={{ color: 'var(--accent)', letterSpacing: 1 }}>{'★'.repeat(p.rating)}</span>
                  <span style={{ opacity: 0.35, letterSpacing: 1 }}>{'★'.repeat(5 - p.rating)}</span>
                  {p.has_comment ? ' · note sent' : ''}
                </span>
              ) : null}
            </div>
            <div className="col" style={{ gap: 6, alignItems: 'flex-end' }}>
              {p.can_rate && !p.rating && (
                <a className="btn btn-outline btn-sm" href={`/thanks/${p.visit_id}`} style={{ textDecoration: 'none' }}>Rate it</a>
              )}
              {p.groups_enabled && (
                <a className="small" href={`/plan?v=${encodeURIComponent(p.venue_slug)}`}>Plan a night here</a>
              )}
            </div>
          </div>
        ))}
        {places.some((p) => p.can_rate && !p.rating) && (
          <span className="small" style={{ paddingTop: 8 }}>
            Ratings and notes go privately to the venue, so they can make the next visit better. You have two weeks after a visit.
          </span>
        )}
      </section>

      <div className="row" style={{ gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <a className="btn btn-ghost btn-sm" href="/connections" style={{ textDecoration: 'none' }}>Your connections</a>
        <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}
