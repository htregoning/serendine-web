'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/avatar';
import { alertGuest } from '@/lib/alerts';
import { notify } from '@/lib/push';

type Client = ReturnType<typeof createClient>;

type Drink = {
  id: string;
  incoming: boolean;
  other_visit: string;
  other_alias: string;
  other_gender: string;
  other_has_photo: boolean;
  note: string | null;
  status: 'offered' | 'accepted' | 'declined' | 'served' | 'cancelled';
  created_at: string;
};

function Glasses() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h6l-.6 5a2.4 2.4 0 0 1-4.8 0z" transform="rotate(12 8 8)" />
      <path d="M13 4h6l-.6 5a2.4 2.4 0 0 1-4.8 0z" transform="rotate(-12 16 8)" />
      <path d="M8.6 11.5 7.4 18M6 18.3h3M15.4 11.5l1.2 6.5M15 18.3h3" />
    </svg>
  );
}

// A small "Send a drink" button that opens a one-line note form.
export function SendDrink({ supabase, toVisit, toAlias, onDone }: { supabase: Client; toVisit: string; toAlias: string; onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('offer_drink', { p_to: toVisit, p_note: note.trim() || null });
    setBusy(false);
    if (error) {
      const m = error.message;
      setError(/already|plenty|switched off|not available|Open to chat/.test(m) ? m : 'That did not send. Please try again.');
      return;
    }
    notify('drink', data as string);
    setOpen(false);
    setNote('');
    onDone(`Drink offered to ${toAlias}. If they accept, staff will bring it over and add it to your bill.`);
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm grow" onClick={() => setOpen(true)}>
        <Glasses /> Send a drink
      </button>
    );
  }
  return (
    <div className="card col" style={{ gap: 8, width: '100%' }}>
      <strong>Send {toAlias} a drink</strong>
      <span className="small">They can accept or say no thanks. If they accept, it&apos;s added to your bill.</span>
      <label className="label" htmlFor={`drink-${toVisit}`}>Note for the staff (optional)</label>
      <input
        id={`drink-${toVisit}`}
        className="input"
        maxLength={80}
        placeholder="e.g. whatever they're drinking"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-ghost btn-sm grow" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn btn-primary btn-sm grow" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Offer drink'}</button>
      </div>
    </div>
  );
}

const STATUS_OUT: Record<Drink['status'], string> = {
  offered: 'Waiting for them to accept',
  accepted: 'Accepted · staff will bring it over',
  declined: 'They said no thanks',
  served: 'Delivered. Cheers!',
  cancelled: 'Withdrawn',
};

// Drinks offered to me (accept / no thanks) and the ones I sent.
export function DrinksPanel({ supabase, myVisitId }: { supabase: Client; myVisitId: string }) {
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_drinks');
    const list = (data as Drink[] | null) ?? [];
    const incomingOffers = list.filter((d) => d.incoming && d.status === 'offered').map((d) => d.id);
    if (seen.current && incomingOffers.some((id) => !seen.current!.has(id))) alertGuest('drink');
    seen.current = new Set(incomingOffers);
    setDrinks(list);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`drinks-${myVisitId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drink_offers' }, () => load())
      .subscribe();
    const poll = setInterval(load, 8000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [supabase, myVisitId, load]);

  async function respond(id: string, accept: boolean) {
    await supabase.rpc('respond_drink', { p_id: id, p_accept: accept });
    if (accept) notify('drink', id);
    load();
  }

  async function withdraw(id: string) {
    await supabase.rpc('cancel_drink', { p_id: id });
    load();
  }

  if (drinks.length === 0) return null;

  return (
    <div className="col" style={{ gap: 10 }}>
      {drinks.map((d) =>
        d.incoming && d.status === 'offered' ? (
          <div key={d.id} className="card col offer" style={{ gap: 10 }}>
            <div className="row">
              <Avatar supabase={supabase} visitId={d.other_visit} alias={d.other_alias} hasPhoto={d.other_has_photo} />
              <div className="col grow" style={{ gap: 2 }}>
                <strong>{d.other_alias} would like to buy you a drink</strong>
                {d.note && <span className="small">&ldquo;{d.note}&rdquo;</span>}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost btn-sm grow" onClick={() => respond(d.id, false)}>No thanks</button>
              <button className="btn btn-primary btn-sm grow" onClick={() => respond(d.id, true)}>Accept</button>
            </div>
          </div>
        ) : (
          <div key={d.id} className="card row" style={{ gap: 12 }}>
            <Glasses />
            <div className="col grow" style={{ gap: 2 }}>
              <strong>{d.incoming ? `Drink from ${d.other_alias}` : `Drink for ${d.other_alias}`}</strong>
              <span className="small">
                {d.incoming
                  ? d.status === 'accepted'
                    ? 'Accepted · on its way'
                    : d.status === 'served'
                      ? 'Delivered. Cheers!'
                      : d.status === 'declined'
                        ? 'You said no thanks'
                        : 'Withdrawn'
                  : STATUS_OUT[d.status]}
              </span>
            </div>
            {!d.incoming && d.status === 'offered' && (
              <button className="btn btn-ghost btn-sm" onClick={() => withdraw(d.id)}>Withdraw</button>
            )}
          </div>
        ),
      )}
    </div>
  );
}
