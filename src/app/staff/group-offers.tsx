'use client';

import { useCallback, useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';

type Client = ReturnType<typeof createClient>;
type Offer = { id: string; min_size: number; offer: string; active: boolean };

const IDEAS = [
  { min: 6, text: 'A dessert platter for the table' },
  { min: 8, text: 'A free bottle of bubbly' },
  { min: 10, text: 'The organiser eats free' },
];

// Group offers: what a party of a given size gets, shown to guests while they plan a night here.
export default function GroupOffers({ supabase, venueId }: { supabase: Client; venueId: string }) {
  const [list, setList] = useState<Offer[] | null>(null);
  const [size, setSize] = useState('8');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('venue_group_offers_list', { v: venueId });
    setList(error ? null : ((data as Offer[] | null) ?? []));
  }, [supabase, venueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setMsg(null);
    const { error } = await supabase.rpc('save_group_offer', { v: venueId, p_id: null, p_min_size: Number(size), p_offer: text.trim(), p_active: true });
    if (error) return setMsg(error.message);
    setText('');
    load();
  }

  async function toggle(o: Offer) {
    await supabase.rpc('save_group_offer', { v: venueId, p_id: o.id, p_min_size: o.min_size, p_offer: o.offer, p_active: !o.active });
    load();
  }

  async function remove(o: Offer) {
    await supabase.rpc('delete_group_offer', { v: venueId, p_id: o.id });
    load();
  }

  if (list === null) {
    return <span className="small" style={{ paddingLeft: 32 }}>Group offers need database update 0027.</span>;
  }
  return (
    <div className="col" style={{ gap: 8, paddingLeft: 32 }}>
      <span className="label" style={{ margin: 0 }}>Group offers</span>
      <span className="small">Guests see these while planning. The one that fits their group size is attached to the request, so you know what was promised.</span>
      {list.map((o) => (
        <div key={o.id} className="row" style={{ gap: 8, alignItems: 'center', opacity: o.active ? 1 : 0.55 }}>
          <span className="pill">{o.min_size}+</span>
          <span className="grow small" style={{ color: 'var(--text)' }}>{o.offer}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => toggle(o)}>{o.active ? 'Pause' : 'Resume'}</button>
          <button className="link-danger" onClick={() => remove(o)}>Remove</button>
        </div>
      ))}
      {list.length < 6 && (
        <>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="small" htmlFor="go-size">Groups of</label>
            <input id="go-size" className="input" type="number" min={2} max={60} value={size} onChange={(e) => setSize(e.target.value)} style={{ width: 76 }} />
            <span className="small">or more get</span>
            <input className="input grow" maxLength={120} placeholder="e.g. a free bottle of bubbly" value={text} onChange={(e) => setText(e.target.value)} aria-label="Offer" style={{ minWidth: 180 }} />
            <button className="btn btn-primary btn-sm" onClick={add} disabled={!text.trim()}>Add</button>
          </div>
          {list.length === 0 && (
            <div className="chips">
              {IDEAS.map((i) => (
                <button key={i.text} type="button" className="chip" onClick={() => { setSize(String(i.min)); setText(i.text); }}>
                  {i.min}+: {i.text}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {msg && <span className="error small" role="status">{msg}</span>}
    </div>
  );
}
