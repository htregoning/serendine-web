'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Logo from '@/components/logo';

export type AdminVenue = {
  id: string;
  slug: string;
  name: string;
  tables: number;
  team: number;
  guests_now: number;
  my_role: string;
  created_at: string;
  kind?: 'venue' | 'event';
  starts_at?: string | null;
  ends_at?: string | null;
};

// "2026-10-04T19:00" in the browser's time zone, for <input type="datetime-local">.
function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function eventWhen(v: AdminVenue) {
  if (!v.starts_at) return '';
  const s = new Date(v.starts_at);
  const now = Date.now();
  const status =
    v.ends_at && new Date(v.ends_at).getTime() < now ? 'Finished' : s.getTime() > now ? 'Upcoming' : 'Live now';
  return `${status} · ${s.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} ${s.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export default function AdminHome({ isAdmin, venues, email }: { isAdmin: boolean; venues: AdminVenue[]; email: string }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [tables, setTables] = useState(10);
  const [zone, setZone] = useState('Main room');
  const [kind, setKind] = useState<'venue' | 'event'>('venue');
  const [starts, setStarts] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    d.setHours(19, 0, 0, 0);
    return localInput(d);
  });
  const [hours, setHours] = useState(4);
  const [place, setPlace] = useState('');
  const [areas, setAreas] = useState('Everyone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const startDate = new Date(starts);
    const { data, error } =
      kind === 'event'
        ? await supabase.rpc('admin_create_event', {
            p_name: name.trim(),
            p_slug: slug,
            p_areas: areas.split('\n').map((a) => a.trim()).filter(Boolean),
            p_starts: startDate.toISOString(),
            p_ends: new Date(startDate.getTime() + hours * 3600000).toISOString(),
            p_place: place,
          })
        : await supabase.rpc('admin_create_venue', {
            p_name: name.trim(),
            p_slug: slug,
            p_tables: tables,
            p_zone: zone,
          });
    setBusy(false);
    if (error) {
      return setError(
        error.code === 'PGRST202' ? 'Events need the latest database update (0012).' : error.message,
      );
    }
    router.push(`/admin/v/${data as string}`);
  }

  return (
    <main className="admin">
      <header className="admin-head">
        <Logo size={40} />
        <div className="col grow" style={{ gap: 2 }}>
          <span className="wordmark" style={{ fontSize: 16 }}>Serendine</span>
          <span className="small">{isAdmin ? 'Admin' : 'Venue manager'} · {email}</span>
        </div>
        {isAdmin && <Link className="btn btn-ghost btn-sm" href="/admin/reports" style={{ textDecoration: 'none', color: 'var(--text)' }}>Reports</Link>}
      </header>

      <h1 className="display" style={{ fontSize: 30 }}>{isAdmin ? 'Venues and events' : 'Your venues'}</h1>

      <div className="admin-grid">
        {venues.map((v) => (
          <Link key={v.id} href={`/admin/v/${v.id}`} className="card col admin-venue" style={{ gap: 8 }}>
            <strong style={{ fontSize: 18 }}>{v.name}</strong>
            <span className="small">
              {v.kind === 'event' ? `Event · ${eventWhen(v)}` : `serendine · /${v.slug}`}
            </span>
            <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
              <span className="small"><b>{v.tables}</b> {v.kind === 'event' ? 'areas' : 'tables'}</span>
              <span className="small"><b>{v.team}</b> team</span>
              <span className="small"><b>{v.guests_now}</b> here now</span>
            </div>
          </Link>
        ))}
        {venues.length === 0 && <p className="small">Nothing here yet. Add the first one below.</p>}
      </div>

      {isAdmin && (
        <form className="card col" style={{ gap: 14, maxWidth: 560 }} onSubmit={create}>
          <strong style={{ fontSize: 18 }}>Add a {kind === 'event' ? 'event' : 'restaurant or bar'}</strong>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={kind === 'venue'} onClick={() => setKind('venue')}>
              Restaurant or bar
            </button>
            <button type="button" className="chip" aria-pressed={kind === 'event'} onClick={() => setKind('event')}>
              Event
            </button>
          </div>
          <div className="col">
            <label className="label" htmlFor="v-name">{kind === 'event' ? 'Event name' : 'Restaurant name'}</label>
            <input
              id="v-name"
              className="input"
              required
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="col">
            <label className="label" htmlFor="v-slug">Web name</label>
            <input
              id="v-slug"
              className="input"
              required
              pattern="[a-z0-9-]{2,60}"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
            />
            <span className="small">Lower-case letters, numbers and dashes. Used in staff links.</span>
          </div>
          {kind === 'event' ? (
            <>
              <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="col grow">
                  <label className="label" htmlFor="e-start">Starts</label>
                  <input id="e-start" className="input" type="datetime-local" required value={starts} onChange={(e) => setStarts(e.target.value)} />
                </div>
                <div className="col" style={{ width: 130 }}>
                  <label className="label" htmlFor="e-hours">Lasts (hours)</label>
                  <input id="e-hours" className="input" type="number" min={1} max={240} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
                </div>
              </div>
              <div className="col">
                <label className="label" htmlFor="e-place">Where</label>
                <input id="e-place" className="input" maxLength={80} placeholder="e.g. Dubai World Trade Centre" value={place} onChange={(e) => setPlace(e.target.value)} />
              </div>
              <div className="col">
                <label className="label" htmlFor="e-areas">Areas, one per line</label>
                <textarea
                  id="e-areas"
                  className="input"
                  rows={5}
                  value={areas}
                  onChange={(e) => setAreas(e.target.value)}
                  placeholder={'North Stand\nSouth Stand\nVIP Lounge'}
                />
                <span className="small">
                  Each area gets its own QR code. Guests see everyone at the event, and can share which area they&apos;re in when
                  both agree. Check-in opens 3 hours before the start and everyone is checked out an hour after the end.
                </span>
              </div>
            </>
          ) : (
          <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
            <div className="col" style={{ width: 140 }}>
              <label className="label" htmlFor="v-tables">Tables</label>
              <input id="v-tables" className="input" type="number" min={1} max={200} value={tables} onChange={(e) => setTables(Number(e.target.value))} />
            </div>
            <div className="col grow">
              <label className="label" htmlFor="v-zone">Area name</label>
              <input id="v-zone" className="input" maxLength={40} value={zone} onChange={(e) => setZone(e.target.value)} />
            </div>
          </div>
          )}
          <span className="small">
            {kind === 'event'
              ? 'You can add areas, print or download the QR codes and invite the organiser on the next screen.'
              : 'You can rename tables, add areas like "Terrace" and invite the manager on the next screen.'}
          </span>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Adding…' : kind === 'event' ? 'Add event' : 'Add restaurant'}
          </button>
        </form>
      )}
    </main>
  );
}
