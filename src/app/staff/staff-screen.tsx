'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { RequestKind, RequestStatus } from '@/lib/types';
import { chime as play, unlockAudio } from '@/lib/alerts';

const chime = () => play([880, 660, 880]);

export type StaffVenue = {
  id: string;
  slug: string;
  name: string;
  accent: string;
  offer_enabled: boolean;
  offer_text: string;
  menu_pdf_path: string | null;
  menu_updated_at: string | null;
  role: 'manager' | 'staff';
};

type Req = { id: string; kind: RequestKind; status: RequestStatus; created_at: string; table_id: string };
type OfferGuest = { visit_id: string; table_label: string; alias: string; redeemed: boolean; code: string | null };

const LABELS: Record<RequestKind, string> = {
  waiter: 'Call a waiter',
  bill: 'Bring the bill',
  water: 'Water please',
};

function ago(iso: string, now: number) {
  const m = Math.floor((now - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : `${m} min ago`;
}

export default function StaffScreen({ venue }: { venue: StaffVenue }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [requests, setRequests] = useState<Req[]>([]);
  const [tables, setTables] = useState<Record<string, string>>({});
  const [guests, setGuests] = useState<OfferGuest[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const isManager = venue.role === 'manager';

  const loadRequests = useCallback(async () => {
    const { data } = await supabase
      .from('service_requests')
      .select('id, kind, status, created_at, table_id')
      .eq('venue_id', venue.id)
      .in('status', ['sent', 'seen'])
      .order('created_at', { ascending: true });
    const list = (data as Req[] | null) ?? [];
    const fresh = list.filter((r) => !seen.current.has(r.id));
    fresh.forEach((r) => seen.current.add(r.id));
    if (!first.current && fresh.length > 0 && sound) chime();
    first.current = false;
    setRequests(list);
  }, [supabase, venue.id, sound]);

  const loadGuests = useCallback(async () => {
    const { data } = await supabase.rpc('staff_offer_guests', { v: venue.id });
    setGuests((data as OfferGuest[] | null) ?? []);
  }, [supabase, venue.id]);

  useEffect(() => {
    supabase
      .from('venue_tables')
      .select('id, label')
      .eq('venue_id', venue.id)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        ((data as { id: string; label: string }[] | null) ?? []).forEach((t) => (map[t.id] = t.label));
        setTables(map);
      });
  }, [supabase, venue.id]);

  // Live: new and changed requests arrive instantly; a slow poll is the safety net.
  useEffect(() => {
    loadRequests();
    const channel = supabase
      .channel(`staff-${venue.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_requests', filter: `venue_id=eq.${venue.id}` },
        () => loadRequests(),
      )
      .subscribe();
    const poll = setInterval(loadRequests, 15000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [supabase, venue.id, loadRequests]);

  useEffect(() => {
    loadGuests();
    const t = setInterval(loadGuests, 10000);
    return () => clearInterval(t);
  }, [loadGuests]);

  useEffect(() => {
    unlockAudio();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  async function setStatus(id: string, status: RequestStatus) {
    setRequests((rs) => (status === 'done' ? rs.filter((r) => r.id !== id) : rs.map((r) => (r.id === id ? { ...r, status } : r))));
    const { error } = await supabase.from('service_requests').update({ status }).eq('id', id);
    if (error) {
      setNote('That did not save. Please try again.');
      loadRequests();
    }
  }

  async function redeem(visitId: string) {
    const { error } = await supabase.rpc('redeem_offer', { p_visit: visitId });
    if (error) setNote('Could not redeem that offer.');
    loadGuests();
  }

  const style = { '--accent': venue.accent } as React.CSSProperties;

  return (
    <main className="staff" style={style}>
      <header className="row" style={{ gap: 16 }}>
        <div className="avatar" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
          {venue.name.trim().charAt(0).toUpperCase()}
        </div>
        <div className="col grow" style={{ gap: 2 }}>
          <span className="display" style={{ fontSize: 26 }}>{venue.name}</span>
          <span className="small">Staff screen · Serendine{isManager ? ' · Manager' : ''}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setSound((s) => !s)} aria-pressed={sound}>
          {sound ? 'Sound on' : 'Turn sound on'}
        </button>
      </header>

      {note && <p className="error" role="status">{note}</p>}

      <div className="staff-grid">
        <section className="col" style={{ gap: 12 }} aria-label="Table requests">
          <div className="row" style={{ gap: 12, alignItems: 'baseline' }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>Table requests</h1>
            <span className="small">{requests.length} open</span>
          </div>
          {requests.length === 0 && (
            <p className="card small" style={{ textAlign: 'center', padding: 40 }}>
              All caught up. New requests appear here with their table number.
            </p>
          )}
          {requests.map((r) => {
            const fresh = r.status === 'sent';
            return (
              <div key={r.id} className="card row" style={{ gap: 18, borderWidth: 2, borderColor: fresh ? 'var(--accent)' : 'var(--line)' }}>
                <div
                  className="table-tile"
                  style={{ background: fresh ? 'var(--accent)' : 'var(--line)', color: fresh ? 'var(--on-accent)' : 'var(--text)' }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8 }}>TABLE</span>
                  <span className="display" style={{ fontSize: 30, lineHeight: 1 }}>{tables[r.table_id] ?? '–'}</span>
                </div>
                <div className="col grow" style={{ gap: 4 }}>
                  <strong style={{ fontSize: 20 }}>{LABELS[r.kind]}</strong>
                  <span className="small">{fresh ? 'New' : 'Someone is on the way'} · {ago(r.created_at, now)}</span>
                </div>
                {fresh && (
                  <button className="btn btn-ghost" onClick={() => setStatus(r.id, 'seen')}>On my way</button>
                )}
                <button className="btn btn-primary" onClick={() => setStatus(r.id, 'done')}>Done</button>
              </div>
            );
          })}
        </section>

        <aside className="col" style={{ gap: 16 }}>
          <div className="card col" style={{ gap: 10 }}>
            <strong>Welcome offer</strong>
            <span className="display" style={{ fontSize: 20 }}>
              {venue.offer_enabled ? venue.offer_text : 'Offer switched off'}
            </span>
            {guests.length === 0 ? (
              <span className="small">No opted-in guests here right now.</span>
            ) : (
              guests.map((g) => (
                <div key={g.visit_id} className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <span className="grow">Table {g.table_label} · {g.alias}</span>
                  {g.redeemed ? (
                    <span className="small">Redeemed {g.code}</span>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => redeem(g.visit_id)} disabled={!venue.offer_enabled}>
                      Redeem
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {isManager && <ManagerTools venue={venue} onSaved={() => router.refresh()} />}
        </aside>
      </div>
    </main>
  );
}

function ManagerTools({ venue, onSaved }: { venue: StaffVenue; onSaved: () => void }) {
  const [supabase] = useState(() => createClient());
  const [offerText, setOfferText] = useState(venue.offer_text);
  const [offerOn, setOfferOn] = useState(venue.offer_enabled);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function saveOffer() {
    setBusy('offer');
    const { error } = await supabase
      .from('venues')
      .update({ offer_text: offerText.trim() || venue.offer_text, offer_enabled: offerOn })
      .eq('id', venue.id);
    setBusy(null);
    setMsg(error ? 'The offer did not save.' : 'Offer saved. Guests see it straight away.');
    if (!error) onSaved();
  }

  async function uploadMenu(file: File) {
    if (file.type !== 'application/pdf') return setMsg('Please choose a PDF file.');
    if (file.size > 10 * 1024 * 1024) return setMsg('That PDF is over 10 MB. Please use a smaller file.');
    setBusy('menu');
    const path = `${venue.id}/menu-${Date.now()}.pdf`;
    const up = await supabase.storage.from('menus').upload(path, file, { contentType: 'application/pdf' });
    if (up.error) {
      setBusy(null);
      return setMsg('The menu did not upload. Please try again.');
    }
    const { error } = await supabase
      .from('venues')
      .update({ menu_pdf_path: path, menu_updated_at: new Date().toISOString() })
      .eq('id', venue.id);
    setBusy(null);
    setMsg(error ? 'Uploaded, but could not switch to the new menu.' : 'New menu is live for guests.');
    if (!error) onSaved();
  }

  async function downloadContacts() {
    setBusy('contacts');
    const { data, error } = await supabase.rpc('marketing_contacts', { v: venue.id });
    setBusy(null);
    if (error) return setMsg('Could not load the guest list.');
    const rows = (data as { email: string; alias: string; opted_in_at: string }[] | null) ?? [];
    const esc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const csv = ['email,name,opted_in_at', ...rows.map((r) => [esc(r.email), esc(r.alias), esc(r.opted_in_at)].join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${venue.slug}-opted-in-guests.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`Downloaded ${rows.length} opted-in guest${rows.length === 1 ? '' : 's'}.`);
  }

  return (
    <div className="card col" style={{ gap: 14 }}>
      <strong>Manager</strong>

      <div className="col">
        <label className="label" htmlFor="offer-text">Welcome offer</label>
        <input id="offer-text" className="input" maxLength={80} value={offerText} onChange={(e) => setOfferText(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={offerOn} onChange={(e) => setOfferOn(e.target.checked)} />
          <span>Show the offer to guests</span>
        </label>
        <button className="btn btn-ghost btn-sm" onClick={saveOffer} disabled={busy === 'offer'}>Save offer</button>
      </div>

      <div className="col">
        <span className="label">Menu (PDF)</span>
        <span className="small">
          {venue.menu_pdf_path
            ? `Live since ${venue.menu_updated_at ? new Date(venue.menu_updated_at).toLocaleDateString() : 'earlier'}`
            : 'No menu uploaded yet'}
        </span>
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
          {busy === 'menu' ? 'Uploading…' : 'Upload new PDF'}
          <input
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMenu(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div className="col">
        <span className="label">Table stickers</span>
        <a className="btn btn-ghost btn-sm" href={`/staff/stickers?v=${venue.slug}`} style={{ textDecoration: 'none', color: 'var(--text)' }}>
          Print QR stickers
        </a>
      </div>

      <div className="col">
        <span className="label">Opted-in guests</span>
        <button className="btn btn-ghost btn-sm" onClick={downloadContacts} disabled={busy === 'contacts'}>
          Download list (CSV)
        </button>
      </div>

      {msg && <p className="small" role="status">{msg}</p>}
    </div>
  );
}
