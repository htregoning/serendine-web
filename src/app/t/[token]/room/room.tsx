'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MODE_LABELS, type ChatMode, type RequestKind, type RequestStatus, type VenueAtTable } from '@/lib/types';

type Visit = { id: string; alias: string; mode: ChatMode; isOpen: boolean; optedIn: boolean };
type Person = { visit_id: string; alias: string; mode: ChatMode; zone: string; public_key: string | null };
type Req = { id: string; kind: RequestKind; status: RequestStatus };

const REQUESTS: Record<RequestKind, { ask: string; done: string }> = {
  waiter: { ask: 'Call a waiter', done: 'Waiter called' },
  bill: { ask: 'Bring the bill', done: 'Bill requested' },
  water: { ask: 'Water please', done: 'Water requested' },
};
const STATUS_TEXT: Record<RequestStatus, string> = {
  sent: 'Sent to staff',
  seen: 'On the way',
  done: 'Done',
  cancelled: 'Cancelled',
};

type Props = { token: string; venue: VenueAtTable; visit: Visit; menuUrl: string | null };

export default function Room({ token, venue, visit, menuUrl }: Props) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [tab, setTab] = useState<'room' | 'service'>('room');
  const [isOpen, setIsOpen] = useState(visit.isOpen);
  const [people, setPeople] = useState<Person[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const loadPeople = useCallback(async () => {
    const { data } = await supabase.rpc('room_presence', { v: venue.venue_id });
    setPeople((data as Person[] | null) ?? []);
  }, [supabase, venue.venue_id]);

  const loadRequests = useCallback(async () => {
    const { data } = await supabase
      .from('service_requests')
      .select('id, kind, status')
      .eq('visit_id', visit.id)
      .in('status', ['sent', 'seen'])
      .order('created_at', { ascending: false });
    setRequests((data as Req[] | null) ?? []);
  }, [supabase, visit.id]);

  // Who's open: refresh every few seconds while this guest is open.
  useEffect(() => {
    if (!isOpen) {
      setPeople([]);
      return;
    }
    loadPeople();
    const t = setInterval(loadPeople, 5000);
    return () => clearInterval(t);
  }, [isOpen, loadPeople]);

  // Live updates for this guest's service requests.
  useEffect(() => {
    loadRequests();
    const channel = supabase
      .channel(`requests-${visit.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_requests', filter: `visit_id=eq.${visit.id}` },
        () => loadRequests(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, visit.id, loadRequests]);

  async function toggleOpen() {
    const next = !isOpen;
    setIsOpen(next);
    const { error } = await supabase.from('visits').update({ is_open: next }).eq('id', visit.id);
    if (error) setIsOpen(!next);
  }

  async function ask(kind: RequestKind) {
    if (requests.some((r) => r.kind === kind)) return;
    const { error } = await supabase.from('service_requests').insert({
      venue_id: venue.venue_id,
      table_id: venue.table_id,
      visit_id: visit.id,
      kind,
    });
    if (error) setNote('That did not send. Please try again.');
    else loadRequests();
  }

  async function cancel(id: string) {
    await supabase.from('service_requests').update({ status: 'cancelled' }).eq('id', id);
    loadRequests();
  }

  async function leave() {
    await supabase.rpc('end_visit', { p_visit: visit.id });
    router.replace(`/t/${token}`);
  }

  const style = { '--accent': venue.accent } as React.CSSProperties;

  return (
    <main className="shell" style={style}>
      <div className="row">
        <div className="col grow" style={{ gap: 2 }}>
          <span className="display" style={{ fontSize: 26 }}>{venue.venue_name}</span>
          <span className="small">Table {venue.table_label} · {visit.alias}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={leave}>Leave</button>
      </div>

      <div className="tabs" role="tablist" aria-label="Sections">
        <button className="tab" role="tab" aria-selected={tab === 'room'} onClick={() => setTab('room')}>The room</button>
        <button className="tab" role="tab" aria-selected={tab === 'service'} onClick={() => setTab('service')}>Service</button>
      </div>

      {note && <p className="error" role="status">{note}</p>}

      {tab === 'room' ? (
        <>
          <div className="card row">
            <div className="col grow" style={{ gap: 4 }}>
              <strong>Open to chat</strong>
              <span className="small">
                {isOpen ? `Visible as ${visit.alias} · ${MODE_LABELS[visit.mode]}` : "You're hidden. Nobody can message you."}
              </span>
            </div>
            <button className="switch" role="switch" aria-checked={isOpen} aria-label="Open to chat" onClick={toggleOpen}>
              <span />
            </button>
          </div>

          {venue.offer_enabled && visit.optedIn && (
            <div className="card offer col">
              <strong>{venue.offer_text}</strong>
              <span className="small">Show this screen to your server to redeem.</span>
            </div>
          )}

          {isOpen ? (
            <div className="col" style={{ gap: 10 }}>
              <span className="eyebrow">Open to chat now · {people.length}</span>
              {people.length === 0 && (
                <p className="small">Nobody else is open yet. We&apos;ll show them here as soon as they switch on.</p>
              )}
              {people.map((p) => (
                <button
                  key={p.visit_id}
                  className="card row"
                  style={{ textAlign: 'left', minHeight: 72 }}
                  onClick={() => setNote('Messaging arrives in the next update.')}
                >
                  <div className="avatar">{p.alias.charAt(0).toUpperCase()}</div>
                  <div className="col grow" style={{ gap: 4 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{p.alias}</strong>
                      <span className={`tag tag-${p.mode}`}>{MODE_LABELS[p.mode]}</span>
                    </div>
                    <span className="small">{p.zone}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="col" style={{ alignItems: 'center', textAlign: 'center', padding: '48px 12px' }}>
              <span className="display" style={{ fontSize: 22 }}>It works both ways</span>
              <p className="small">Switch on Open to chat to see who else is open. Until then, nobody knows you&apos;re here.</p>
            </div>
          )}
        </>
      ) : (
        <>
          {menuUrl ? (
            <a className="card row" href={menuUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'none' }}>
              <div className="col grow" style={{ gap: 3 }}>
                <strong>See the menu</strong>
                <span className="small">Tonight&apos;s menu from {venue.venue_name}</span>
              </div>
              <span aria-hidden>›</span>
            </a>
          ) : (
            <p className="card small">The menu isn&apos;t online yet. Ask your server.</p>
          )}

          <span className="eyebrow">Ask the staff</span>
          <div className="grid3">
            {(Object.keys(REQUESTS) as RequestKind[]).map((k) => {
              const active = requests.some((r) => r.kind === k);
              return (
                <button key={k} className="service-btn" data-active={active} onClick={() => ask(k)} aria-label={REQUESTS[k].ask}>
                  {active ? REQUESTS[k].done : REQUESTS[k].ask}
                </button>
              );
            })}
          </div>

          {requests.length > 0 && (
            <div className="col" style={{ gap: 10 }}>
              <span className="eyebrow">Your requests</span>
              {requests.map((r) => (
                <div key={r.id} className="card row" role="status">
                  <span className="dot" style={{ background: r.status === 'seen' ? 'var(--accent)' : 'var(--faint)' }} />
                  <div className="col grow" style={{ gap: 2 }}>
                    <strong>{REQUESTS[r.kind].done}</strong>
                    <span className="small">{STATUS_TEXT[r.status]}</span>
                  </div>
                  {r.status === 'sent' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => cancel(r.id)}>Cancel</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="small">Requests go straight to the staff screen with your table number. Pay with your server as usual.</p>
        </>
      )}
    </main>
  );
}
