'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { playSound } from '@/lib/alerts';
import { notify } from '@/lib/push';
import { fromDubaiLocal, when } from '@/lib/gatherings';

type Client = ReturnType<typeof createClient>;
type Req = {
  id: string;
  code: string;
  title: string;
  starts_at: string;
  party_size: number;
  note: string | null;
  status: 'requested' | 'confirmed' | 'suggested' | 'declined';
  suggested_at: string | null;
  organiser_name: string | null;
  organiser_email: string | null;
  going: number;
  offer_text?: string | null;
};

const LABEL: Record<Req['status'], string> = {
  requested: 'New request',
  confirmed: 'Confirmed',
  suggested: 'You suggested another time',
  declined: 'Declined',
};

// Group nights out guests have asked to hold here.
export default function GroupRequests({ supabase, venueId }: { supabase: Client; venueId: string }) {
  const [list, setList] = useState<Req[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('21:00');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('venue_gatherings', { v: venueId });
    if (error) return setList(null); // before update 0025
    const rows = (data as Req[] | null) ?? [];
    const fresh = rows.filter((r) => r.status === 'requested').map((r) => r.id);
    if (seen.current && fresh.some((id) => !seen.current!.has(id))) playSound('staff');
    seen.current = new Set(fresh);
    setList(rows);
  }, [supabase, venueId]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 30000);
    return () => clearInterval(poll);
  }, [load]);

  async function answer(r: Req, action: 'confirm' | 'decline' | 'suggest') {
    setMsg(null);
    const { error } = await supabase.rpc('answer_gathering', {
      p_id: r.id,
      p_action: action,
      p_time: action === 'suggest' && date ? fromDubaiLocal(date, time) : null,
      p_note: note.trim() || null,
    });
    if (error) return setMsg(error.message);
    notify('gathering', r.id);
    setOpen(null);
    setNote('');
    load();
  }

  if (!list || list.length === 0) return null;
  return (
    <div className="card col" style={{ gap: 12, borderColor: list.some((r) => r.status === 'requested') ? 'var(--accent)' : 'var(--line)', borderWidth: 2 }}>
      <strong>Group requests · {list.filter((r) => r.status === 'requested').length} new</strong>
      {msg && <p className="error" style={{ margin: 0 }}>{msg}</p>}
      {list.map((r) => (
        <div key={r.id} className="col" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{r.title} · {r.party_size} people</span>
          <span className="small">
            {when(r.starts_at)} · {r.organiser_name ?? 'Guest'}
            {r.organiser_email ? ` (${r.organiser_email})` : ''} · {r.going} said they&apos;re in
          </span>
          {r.note && <span className="small">&ldquo;{r.note}&rdquo;</span>}
          {r.offer_text && <span className="small" style={{ color: 'var(--accent)', fontWeight: 700 }}>Your group offer applies: {r.offer_text}</span>}
          <span className="small" style={{ fontWeight: 700 }}>
            {LABEL[r.status]}
            {r.status === 'suggested' && r.suggested_at ? `: ${when(r.suggested_at)}` : ''}
          </span>
          {open === r.id ? (
            <div className="col" style={{ gap: 8 }}>
              <input className="input" placeholder="Note for the group (optional), e.g. a table by the window" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={() => answer(r, 'confirm')}>Confirm</button>
                <button className="btn btn-ghost btn-sm" onClick={() => answer(r, 'decline')}>Can&apos;t do it</button>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <input className="input" type="date" aria-label="Suggested date" style={{ width: 170 }} value={date} onChange={(e) => setDate(e.target.value)} />
                <input className="input" type="time" aria-label="Suggested time" step={900} style={{ width: 120 }} value={time} onChange={(e) => setTime(e.target.value)} />
                <button className="btn btn-ghost btn-sm" disabled={!date} onClick={() => answer(r, 'suggest')}>Suggest this time</button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                setOpen(r.id);
                setDate(new Date(r.starts_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }));
              }}
            >
              {r.status === 'requested' ? 'Answer' : 'Change answer'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
