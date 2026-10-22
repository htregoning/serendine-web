'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type KN = { k: string | number; n: number };
type Report = {
  days: number;
  check_ins: number;
  guests: number;
  new_guests: number;
  returning_guests: number;
  came_twice_plus: number;
  avg_visits: number | null;
  avg_minutes: number | null;
  opted_in: number;
  by_weekday: KN[];
  by_hour: KN[];
  ages: KN[];
  sexes: KN[];
  ratings: KN[];
  avg_rating: number | null;
  features: Record<'requests' | 'chats' | 'group_chat' | 'drinks' | 'orders' | 'offers' | 'loyalty', number>;
  loyalty: { stamps: number; rewards: number };
  top_tables: KN[];
  group_plans: number;
  takeaway_visits?: number;
};
type GuestRow = Record<string, string | number | boolean | null>;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SEX: Record<string, string> = { male: 'Male', female: 'Female', unspecified: 'Not given' };
const FEATURE: Record<keyof Report['features'], string> = {
  requests: 'Called staff',
  orders: 'Ordered at the table',
  chats: 'Chatted to a table',
  group_chat: 'Group chat',
  drinks: 'Sent a drink',
  offers: 'Used welcome offer',
  loyalty: 'Loyalty stamp',
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

function downloadCsv(filename: string, rows: GuestRow[]) {
  if (rows.length === 0) return;
  const header = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// One measure as labelled horizontal bars (single colour; the number is written beside each bar).
function Bars({ title, rows, total, unit = '' }: { title: string; rows: { label: string; n: number }[]; total?: number; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="card col report-bars" style={{ gap: 10 }} aria-label={title}>
      <strong>{title}</strong>
      {rows.length === 0 && <span className="small">Nothing yet in this period.</span>}
      <div className="col" style={{ gap: 6 }} role="table" aria-label={title}>
        {rows.map((r) => (
          <div key={r.label} className="report-bar-row" role="row" title={`${r.label}: ${r.n}${unit}${total ? ` (${pct(r.n, total)}%)` : ''}`}>
            <span className="report-bar-label" role="rowheader">{r.label}</span>
            <span className="report-bar-track" aria-hidden="true">
              <span className="report-bar" style={{ width: `${(r.n / max) * 100}%` }} />
            </span>
            <span className="report-bar-value" role="cell">
              {r.n}{unit}{total ? <span className="small"> · {pct(r.n, total)}%</span> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="stat">
      <span className="small">{label}</span>
      <strong style={{ fontSize: 26 }}>{value}</strong>
      {note && <span className="small">{note}</span>}
    </div>
  );
}

export default function Reports({ venue }: { venue: { id: string; slug: string; name: string } }) {
  const [supabase] = useState(() => createClient());
  const [days, setDays] = useState(30);
  const [r, setR] = useState<Report | null | undefined>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setR(null);
    const { data, error } = await supabase.rpc('venue_insights', { v: venue.id, p_days: days });
    setR(error ? undefined : (data as Report));
  }, [supabase, venue.id, days]);

  useEffect(() => {
    load();
  }, [load]);

  async function download() {
    setBusy(true);
    const { data } = await supabase.rpc('venue_insights_guests', { v: venue.id, p_days: days });
    setBusy(false);
    downloadCsv(`${venue.slug}-guests-last-${days}-days.csv`, (data as GuestRow[] | null) ?? []);
  }

  return (
    <main className="admin">
      <header className="admin-head">
        <a href={`/staff?v=${venue.slug}`} className="small">‹ Staff screen</a>
        <div className="grow" />
        <a className="btn btn-ghost btn-sm" href={`/staff/guests?v=${venue.slug}`} style={{ textDecoration: 'none', color: 'var(--text)' }}>Guest list</a>
      </header>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <h1 className="display grow" style={{ fontSize: 28, margin: 0 }}>Reports · {venue.name}</h1>
        <div className="chips" role="group" aria-label="Period">
          {[7, 30, 90, 365].map((d) => (
            <button key={d} className="chip" aria-pressed={days === d} onClick={() => setDays(d)}>
              {d === 365 ? '12 months' : `${d} days`}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={download} disabled={busy || !r || r.guests === 0}>
          {busy ? 'Preparing…' : 'Download guests (CSV)'}
        </button>
      </div>

      {r === undefined && <p className="card small">Reports need database updates 0031, 0032 and 0033.</p>}
      {r === null && <p className="small">Loading…</p>}
      {r && (
        <>
          <div className="report-tiles">
            <Tile label="Check-ins" value={r.check_ins} note={r.takeaway_visits ? `incl. ${r.takeaway_visits} takeaway (pass scans)` : undefined} />
            <Tile label="Guests" value={r.guests} note={`${r.new_guests} new · ${r.returning_guests} returning`} />
            <Tile label="Came back in this period" value={`${pct(r.came_twice_plus, r.guests)}%`} note={`${r.came_twice_plus} came 2+ times · avg ${r.avg_visits ?? 0} visits`} />
            <Tile label="Time checked in" value={r.avg_minutes ? `${r.avg_minutes} min` : '–'} note="average visit" />
            <Tile label="Rating" value={r.avg_rating ? `${r.avg_rating} ★` : '–'} note={`${r.ratings.reduce((a, x) => a + x.n, 0)} ratings`} />
            <Tile label="OK to contact" value={r.opted_in} note={`${pct(r.opted_in, r.guests)}% of guests`} />
            <Tile label="Loyalty" value={r.loyalty.rewards} note={`rewards given · ${r.loyalty.stamps} stamps`} />
            <Tile label="Group plans" value={r.group_plans} note="nights out requested" />
          </div>

          <div className="report-grid">
            <Bars
              title="What guests used (share of visits)"
              total={r.check_ins}
              rows={(Object.keys(FEATURE) as (keyof Report['features'])[]).map((k) => ({ label: FEATURE[k], n: r.features[k] ?? 0 }))}
            />
            <Bars title="Busiest days" rows={r.by_weekday.map((x) => ({ label: DAYS[Number(x.k) - 1], n: x.n }))} />
            <Bars title="Check-ins by hour" rows={r.by_hour.map((x) => ({ label: hourLabel(Number(x.k)), n: x.n }))} />
            <Bars title="Ages (guests)" total={r.guests} rows={r.ages.map((x) => ({ label: String(x.k), n: x.n }))} />
            <Bars title="Sex (guests)" total={r.guests} rows={r.sexes.map((x) => ({ label: SEX[String(x.k)] ?? String(x.k), n: x.n }))} />
            <Bars title="Ratings" rows={r.ratings.map((x) => ({ label: `${x.k} ★`, n: x.n }))} />
            <Bars title="Busiest tables" rows={r.top_tables.map((x) => ({ label: `Table ${x.k}`, n: x.n }))} />
          </div>
          <p className="small" style={{ margin: 0 }}>
            Ages and sex come from guests&apos; saved details and are only shown in groups. Contact details in the download follow the guest list;
            only guests marked OK to contact may be sent offers.
          </p>
        </>
      )}
    </main>
  );
}
