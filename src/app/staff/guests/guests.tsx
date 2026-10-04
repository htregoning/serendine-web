'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Guest = {
  user_id: string;
  name: string | null;
  email: string;
  last_alias: string;
  visits: number;
  first_visit: string;
  last_visit: string;
  last_table: string;
  last_zone: string;
  ok_to_contact: boolean;
  offers_redeemed: number;
  drinks_bought: number;
  note: string;
};

type Visit = {
  started_at: string;
  ended_at: string | null;
  table_label: string;
  zone: string;
  alias: string;
  opted_in: boolean;
  offer_redeemed: boolean;
  drinks_bought: number;
  requests: number;
};

type Stats = {
  check_ins: number;
  guests: number;
  new_guests: number;
  repeat_guests: number;
  opted_in: number;
  drinks: number;
  requests: number;
};

type ExportRow = {
  visited_at: string;
  left_at: string | null;
  table_label: string;
  zone: string;
  name: string | null;
  email: string;
  alias: string;
  ok_to_contact: boolean;
  total_visits: number;
};

type Filter = 'all' | 'contact' | 'regulars';

const day = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const time = (s: string) => new Date(s).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function ago(s: string) {
  const days = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return day(s);
}

function downloadCsv(filename: string, header: string[], rows: (string | number | boolean | null)[][]) {
  const esc = (v: string | number | boolean | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  // The byte-order mark makes Excel read accented names correctly.
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function GuestRow({ venueId, guest, onNoteSaved }: { venueId: string; guest: Guest; onNoteSaved: (n: string) => void }) {
  const [supabase] = useState(() => createClient());
  const [open, setOpen] = useState(false);
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [note, setNote] = useState(guest.note);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !visits) {
      const { data } = await supabase.rpc('venue_guest_visits', { v: venueId, p_user: guest.user_id });
      setVisits((data as Visit[] | null) ?? []);
    }
  }

  async function saveNote() {
    setSaving(true);
    const { error } = await supabase.rpc('set_guest_note', { v: venueId, p_user: guest.user_id, p_note: note });
    setSaving(false);
    if (!error) {
      setSaved(true);
      onNoteSaved(note);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  const display = guest.name || guest.last_alias;

  return (
    <article className="card col guest" style={{ gap: 10 }}>
      <button className="guest-head" onClick={toggle} aria-expanded={open}>
        <span className="guest-avatar">{display.trim().charAt(0).toUpperCase()}</span>
        <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
          <strong className="guest-name">
            {display}
            {guest.name && guest.last_alias && guest.last_alias !== guest.name && (
              <span className="small"> · “{guest.last_alias}”</span>
            )}
          </strong>
          <span className="small guest-email">{guest.email}</span>
          <span className="small">
            {guest.visits} visit{guest.visits === 1 ? '' : 's'} · last {ago(guest.last_visit)} · table {guest.last_table}
            {guest.last_zone ? ` (${guest.last_zone})` : ''}
          </span>
        </span>
        <span className="col" style={{ gap: 4, alignItems: 'flex-end' }}>
          {guest.ok_to_contact ? (
            <span className="pill pill-ok">OK to contact</span>
          ) : (
            <span className="pill">No offers</span>
          )}
          {guest.visits > 1 && <span className="pill">Regular</span>}
        </span>
      </button>

      {guest.note && !open && <span className="small guest-note-preview">📝 {guest.note}</span>}

      {open && (
        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <span className="small">First visit {day(guest.first_visit)}</span>
            <span className="small">Offers used: {guest.offers_redeemed}</span>
            <span className="small">Drinks bought for others: {guest.drinks_bought}</span>
          </div>
          <div className="col" style={{ gap: 6 }}>
            <label className="label" htmlFor={`note-${guest.user_id}`}>Notes (only your team sees these)</label>
            <textarea
              id={`note-${guest.user_id}`}
              className="input"
              rows={2}
              maxLength={1000}
              placeholder="e.g. Birthday in March, likes the corner table"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={saveNote} disabled={saving || note === guest.note}>
                {saving ? 'Saving…' : 'Save note'}
              </button>
              {saved && <span className="small">Saved</span>}
            </div>
          </div>
          <div className="col" style={{ gap: 6 }}>
            <span className="label">Visits</span>
            {visits === null && <span className="small">Loading…</span>}
            {visits?.map((x) => (
              <div key={x.started_at} className="visit-row">
                <span>
                  <b>{day(x.started_at)}</b> · {time(x.started_at)}
                  {x.ended_at ? `–${time(x.ended_at)}` : ' · here now'}
                </span>
                <span className="small">
                  Table {x.table_label}
                  {x.zone ? ` · ${x.zone}` : ''}
                  {x.offer_redeemed ? ' · used offer' : ''}
                  {x.drinks_bought > 0 ? ` · ${x.drinks_bought} drink${x.drinks_bought === 1 ? '' : 's'} sent` : ''}
                  {x.requests > 0 ? ` · ${x.requests} service request${x.requests === 1 ? '' : 's'}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default function Guests({ venue }: { venue: { id: string; slug: string; name: string } }) {
  const [supabase] = useState(() => createClient());
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState(7);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('venue_guests', { v: venue.id });
    if (error) {
      setMsg(
        error.code === 'PGRST202'
          ? 'The guest list needs the latest database update (0011).'
          : 'Could not load guests. Please refresh.',
      );
      setGuests([]);
      return;
    }
    setGuests((data as Guest[] | null) ?? []);
  }, [supabase, venue.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    supabase.rpc('venue_stats', { v: venue.id, p_days: days }).then(({ data }) => {
      setStats(((data as Stats[] | null) ?? [])[0] ?? null);
    });
  }, [supabase, venue.id, days]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (guests ?? []).filter((g) => {
      if (filter === 'contact' && !g.ok_to_contact) return false;
      if (filter === 'regulars' && g.visits < 2) return false;
      if (!term) return true;
      return [g.name, g.email, g.last_alias, g.last_table, g.note].some((x) => (x ?? '').toLowerCase().includes(term));
    });
  }, [guests, q, filter]);

  async function exportVisits(range: 'week' | 'month' | 'all') {
    setBusy(true);
    const from =
      range === 'all' ? null : new Date(Date.now() - (range === 'week' ? 7 : 30) * 86400000).toISOString();
    const { data, error } = await supabase.rpc('venue_visit_export', { v: venue.id, p_from: from, p_to: null });
    setBusy(false);
    if (error) return setMsg('Could not prepare the download.');
    const rows = (data as ExportRow[] | null) ?? [];
    downloadCsv(
      `${venue.slug}-visits-${range}.csv`,
      ['Date', 'Arrived', 'Left', 'Table', 'Area', 'Name', 'Email', 'Alias', 'OK to contact', 'Total visits'],
      rows.map((r) => [
        new Date(r.visited_at).toLocaleDateString(),
        time(r.visited_at),
        r.left_at ? time(r.left_at) : '',
        r.table_label,
        r.zone,
        r.name ?? '',
        r.email,
        r.alias,
        r.ok_to_contact ? 'Yes' : 'No',
        r.total_visits,
      ]),
    );
    setMsg(`Downloaded ${rows.length} visit${rows.length === 1 ? '' : 's'}.`);
  }

  function exportGuests() {
    const list = shown;
    downloadCsv(
      `${venue.slug}-guests${filter === 'contact' ? '-ok-to-contact' : filter === 'regulars' ? '-regulars' : ''}.csv`,
      ['Name', 'Email', 'Alias', 'Visits', 'First visit', 'Last visit', 'Last table', 'Area', 'OK to contact', 'Offers used', 'Notes'],
      list.map((g) => [
        g.name ?? '',
        g.email,
        g.last_alias,
        g.visits,
        new Date(g.first_visit).toLocaleDateString(),
        new Date(g.last_visit).toLocaleDateString(),
        g.last_table,
        g.last_zone,
        g.ok_to_contact ? 'Yes' : 'No',
        g.offers_redeemed,
        g.note,
      ]),
    );
    setMsg(`Downloaded ${list.length} guest${list.length === 1 ? '' : 's'}.`);
  }

  const tiles: [string, number | undefined][] = [
    ['Check-ins', stats?.check_ins],
    ['Guests', stats?.guests],
    ['New', stats?.new_guests],
    ['Returning', stats?.repeat_guests],
    ['Opted in to offers', stats?.opted_in],
    ['Drinks sent', stats?.drinks],
  ];

  return (
    <main className="admin">
      <header className="admin-head">
        <a href={`/staff?v=${venue.slug}`} className="small">← Staff screen</a>
      </header>
      <h1 className="display" style={{ fontSize: 30 }}>Guests · {venue.name}</h1>
      <p className="small">
        Everyone who checked in here, newest first. Chats always stay private: you can see who visited, not who they talked to.
        Only send offers or marketing to guests marked <b>OK to contact</b>.
      </p>

      <section className="col" style={{ gap: 10 }} aria-label="Summary">
        <div className="chips">
          {[7, 30, 90].map((d) => (
            <button key={d} className="chip" aria-pressed={days === d} onClick={() => setDays(d)}>
              Last {d} days
            </button>
          ))}
        </div>
        <div className="stat-grid">
          {tiles.map(([label, value]) => (
            <div key={label} className="stat">
              <span className="stat-value">{value ?? '–'}</span>
              <span className="small">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card col" style={{ gap: 10 }} aria-label="Downloads">
        <strong>Download for follow-up</strong>
        <span className="small">Every visit with date, time, table and area. Opens in Excel or Google Sheets.</span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => exportVisits('week')}>Visits: last 7 days</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => exportVisits('month')}>Last 30 days</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => exportVisits('all')}>All time</button>
          <button className="btn btn-ghost btn-sm" disabled={!guests?.length} onClick={exportGuests}>Guest list (as filtered below)</button>
        </div>
      </section>

      {msg && <p className="card small" role="status">{msg}</p>}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input
          className="input grow"
          style={{ minWidth: 200 }}
          placeholder="Search name, email, table or notes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chips">
          {(
            [
              ['all', 'Everyone'],
              ['contact', 'OK to contact'],
              ['regulars', 'Regulars'],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {guests === null && <p className="small">Loading…</p>}
      {guests && shown.length === 0 && (
        <p className="card small">{guests.length === 0 ? 'No check-ins yet.' : 'Nobody matches that search.'}</p>
      )}
      {shown.map((g) => (
        <GuestRow
          key={g.user_id}
          venueId={venue.id}
          guest={g}
          onNoteSaved={(n) => setGuests((all) => (all ?? []).map((x) => (x.user_id === g.user_id ? { ...x, note: n } : x)))}
        />
      ))}
    </main>
  );
}
