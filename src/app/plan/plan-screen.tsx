'use client';
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { notify } from '@/lib/push';
import { STATUS_TEXT, fromDubaiLocal, when, type Gathering } from '@/lib/gatherings';

export type BookableVenue = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  place: string | null;
  accent: string;
  has_logo: boolean;
  brand_version: number;
  group_offers?: { min_size: number; offer: string }[]; // after update 0027
};

// The venue's offer for a group this size: the biggest threshold reached.
function offerFor(v: BookableVenue | undefined, size: number) {
  return [...(v?.group_offers ?? [])].sort((a, b) => b.min_size - a.min_size).find((o) => o.min_size <= size) ?? null;
}
export type MyPlan = { code: string; title: string; starts_at: string; status: Gathering['status']; venue_name: string; going: number; i_am_organiser: boolean };

// Tomorrow in Dubai, as yyyy-mm-dd, for the date picker's default.
function dubaiDate(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
}

export default function PlanScreen({ venues, mine, startVenue, defaultName, backHref = '/', backLabel = 'Home' }: { venues: BookableVenue[]; mine: MyPlan[]; startVenue: string | null; defaultName: string; backHref?: string; backLabel?: string }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [making, setMaking] = useState(mine.length === 0 || !!startVenue);
  const [venueId, setVenueId] = useState(() => venues.find((v) => v.slug === startVenue)?.id ?? '');
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(dubaiDate(1));
  const [time, setTime] = useState('20:00');
  const [size, setSize] = useState(6);
  const [note, setNote] = useState('');
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(
    () => venues.filter((v) => !query.trim() || `${v.name} ${v.place ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())),
    [venues, query],
  );
  const venue = venues.find((v) => v.id === venueId);
  const offer = offerFor(venue, size);
  const nextOffer = [...(venue?.group_offers ?? [])].sort((a, b) => a.min_size - b.min_size).find((o) => o.min_size > size) ?? null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!venueId) return setError('Pick a place first.');
    if (!title.trim()) return setError('Give your plan a name, like "Sarah\'s birthday" or "Friday drinks".');
    if (!name.trim()) return setError('Add your name so friends know who invited them.');
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('create_gathering', {
      p_venue: venueId,
      p_title: title.trim(),
      p_starts_at: fromDubaiLocal(date, time),
      p_party_size: size,
      p_note: note.trim() || null,
      p_name: name.trim(),
    });
    if (error || !data) {
      setBusy(false);
      return setError(error?.message ?? 'That did not work. Please try again.');
    }
    const code = data as string;
    // Let the venue know (the database checks it's a fresh request from the organiser).
    const { data: g } = await supabase.rpc('gathering_by_code', { p_code: code });
    const id = (g as { id: string }[] | null)?.[0]?.id;
    if (id) notify('gathering', id);
    router.push(`/g/${code}?new=1`);
  }

  return (
    <main className="shell">
      <a className="small" href={backHref} style={{ alignSelf: 'flex-start' }}>‹ {backLabel}</a>
      <div className="row">
        <h1 className="display grow" style={{ fontSize: 30 }}>Plan a night out</h1>
        {!making && <button className="btn btn-primary btn-sm" onClick={() => setMaking(true)}>New plan</button>}
      </div>

      {mine.length > 0 && !making && (
        <div className="col" style={{ gap: 0 }}>
          <span className="eyebrow" style={{ paddingBottom: 6 }}>Your plans</span>
          {mine.map((p) => (
            <a key={p.code} href={`/g/${p.code}`} className="row person-row plan-row">
              <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                <strong>{p.title}</strong>
                <span className="small">{p.venue_name} · {when(p.starts_at)} · {p.going} going</span>
                <span className="small" style={{ color: p.status === 'confirmed' ? 'var(--good)' : 'var(--muted)' }}>{STATUS_TEXT[p.status]}</span>
              </div>
              <span aria-hidden="true">›</span>
            </a>
          ))}
        </div>
      )}

      {making && (
        <form className="col" style={{ gap: 18 }} onSubmit={create}>
          {venues.length === 0 ? (
            <p className="card small">No venues are taking group plans on Serendine yet. Check back soon.</p>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              <span className="label">Where?</span>
              {venues.length > 6 && (
                <input className="input" placeholder="Search places" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search places" />
              )}
              <div className="col" style={{ gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {shown.map((v) => (
                  <button key={v.id} type="button" className="venue-pick" aria-pressed={venueId === v.id} onClick={() => setVenueId(v.id)}>
                    {v.has_logo ? (
                      <img src={`/api/logo/${v.id}?v=${v.brand_version}`} alt="" className="venue-pick-logo" />
                    ) : (
                      <span className="venue-pick-logo" style={{ background: v.accent }}>{v.name.charAt(0).toUpperCase()}</span>
                    )}
                    <span className="col" style={{ gap: 0, alignItems: 'flex-start', textAlign: 'start' }}>
                      <b>{v.name}</b>
                      {v.place && <span className="small">{v.place}</span>}
                      {(v.group_offers?.length ?? 0) > 0 && (
                        <span className="small" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                          Group offers from {Math.min(...v.group_offers!.map((o) => o.min_size))} people
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="col">
            <label className="label" htmlFor="p-title">What&apos;s the occasion?</label>
            <input id="p-title" className="input" maxLength={80} placeholder="e.g. Sarah's birthday" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="row" style={{ gap: 10 }}>
            <div className="col grow">
              <label className="label" htmlFor="p-date">Date</label>
              <input id="p-date" className="input" type="date" min={dubaiDate(0)} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="col" style={{ width: 130 }}>
              <label className="label" htmlFor="p-time">Time</label>
              <input id="p-time" className="input" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="col">
            <span className="label">How many of you?</span>
            <div className="row" style={{ gap: 12 }}>
              <button type="button" className="qty-btn" onClick={() => setSize((s) => Math.max(2, s - 1))} aria-label="Fewer people">−</button>
              <strong style={{ fontSize: 22, minWidth: 32, textAlign: 'center' }}>{size}</strong>
              <button type="button" className="qty-btn" onClick={() => setSize((s) => Math.min(60, s + 1))} aria-label="More people">+</button>
              <span className="small">people, roughly. You can tell the venue if it changes.</span>
            </div>
            {offer && (
              <div className="offer-row" role="status" style={{ marginTop: 10 }}>
                <span className="grow small">
                  <b style={{ color: 'var(--accent)' }}>{venue?.name} offer for {offer.min_size}+</b> · {offer.offer}
                </span>
              </div>
            )}
            {nextOffer && (
              <span className="small" style={{ marginTop: 6 }}>
                Bring {nextOffer.min_size - size} more and {venue?.name} offers: {nextOffer.offer}
              </span>
            )}
          </div>

          <div className="col">
            <label className="label" htmlFor="p-note">Anything for the venue? (optional)</label>
            <input id="p-note" className="input" maxLength={300} placeholder="e.g. a table outside, one vegetarian, a cake at 9" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="col">
            <label className="label" htmlFor="p-name">Your name, as friends know you</label>
            <input id="p-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {error && <p className="error" role="status" style={{ margin: 0 }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy || venues.length === 0}>
            {busy ? 'Sending…' : venue ? `Ask ${venue.name} and get the invite link` : 'Ask the venue and get the invite link'}
          </button>
          <span className="small" style={{ textAlign: 'center' }}>
            The venue sees your name, email, the date and how many of you. No payment, no deposit.
          </span>
          {mine.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMaking(false)}>Back to your plans</button>
          )}
        </form>
      )}
    </main>
  );
}
