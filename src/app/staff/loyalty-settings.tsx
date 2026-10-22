'use client';

import { useCallback, useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import type { LoyaltyKind } from '@/lib/loyalty';

type Client = ReturnType<typeof createClient>;
type Scheme = { id: string; kind: LoyaltyKind; name: string; item: string | null; target: number; reward: string; active: boolean; members: number; rewards_given: number };

const IDEAS: { kind: LoyaltyKind; name: string; item?: string; target: number; reward: string }[] = [
  { kind: 'stamps', name: 'Coffee card', item: 'coffees', target: 9, reward: 'your 10th coffee free' },
  { kind: 'visits', name: 'Regulars', target: 5, reward: 'a free dessert' },
  { kind: 'stamps', name: 'Brunch club', item: 'brunches', target: 5, reward: 'a free brunch' },
];

// Managers: the venue's loyalty schemes. Visit rewards count themselves; stamp cards are added by staff.
export default function LoyaltySettings({ supabase, venueId }: { supabase: Client; venueId: string }) {
  const [list, setList] = useState<Scheme[] | null>(null);
  const [kind, setKind] = useState<LoyaltyKind>('stamps');
  const [name, setName] = useState('');
  const [item, setItem] = useState('');
  const [target, setTarget] = useState('9');
  const [reward, setReward] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('venue_loyalty_schemes', { v: venueId });
    setList(error ? null : ((data as Scheme[] | null) ?? []));
  }, [supabase, venueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.rpc('save_loyalty_scheme', {
      v: venueId, p_id: null, p_kind: kind, p_name: name.trim(), p_item: kind === 'stamps' ? item.trim() : null,
      p_target: Number(target), p_reward: reward.trim(), p_active: true,
    });
    if (error) return setMsg(error.message);
    setName('');
    setItem('');
    setReward('');
    setMsg('Added. Guests see it straight away.');
    load();
  }

  async function toggle(s: Scheme) {
    await supabase.rpc('save_loyalty_scheme', {
      v: venueId, p_id: s.id, p_kind: s.kind, p_name: s.name, p_item: s.item, p_target: s.target, p_reward: s.reward, p_active: !s.active,
    });
    load();
  }

  if (list === null) return <p className="card small">Loyalty schemes need database update 0032.</p>;
  return (
    <div className="card col" style={{ gap: 14 }}>
      <div className="col" style={{ gap: 4 }}>
        <strong>Loyalty</strong>
        <span className="small">
          Reward regulars. <b>Visit rewards</b> count check-ins by themselves (one a day). <b>Stamp cards</b> are filled by staff tapping +1 on
          the staff screen, e.g. for each coffee. When a guest reaches the number, their reward shows on their phone and staff tap Redeem.
        </span>
      </div>

      {list.map((s) => (
        <div key={s.id} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', opacity: s.active ? 1 : 0.55, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <div className="col grow" style={{ gap: 2, minWidth: 200 }}>
            <strong>{s.name}</strong>
            <span className="small">
              {s.kind === 'visits' ? `Every ${s.target} visits` : `Every ${s.target} ${s.item ?? 'stamps'}`}: {s.reward}
            </span>
            <span className="small">{s.members} collecting · {s.rewards_given} rewards given</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => toggle(s)}>{s.active ? 'Pause' : 'Resume'}</button>
        </div>
      ))}

      <form className="col" style={{ gap: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }} onSubmit={add}>
        <span className="label" style={{ margin: 0 }}>Add a scheme</span>
        {list.length === 0 && (
          <div className="chips">
            {IDEAS.map((i) => (
              <button
                key={i.name}
                type="button"
                className="chip"
                onClick={() => {
                  setKind(i.kind);
                  setName(i.name);
                  setItem(i.item ?? '');
                  setTarget(String(i.target));
                  setReward(i.reward);
                }}
              >
                {i.name}
              </button>
            ))}
          </div>
        )}
        <div className="chips">
          <button type="button" className="chip" aria-pressed={kind === 'stamps'} onClick={() => setKind('stamps')}>Stamp card</button>
          <button type="button" className="chip" aria-pressed={kind === 'visits'} onClick={() => setKind('visits')}>Visit reward</button>
        </div>
        <input className="input" maxLength={40} placeholder="Name, e.g. Coffee card" value={name} onChange={(e) => setName(e.target.value)} aria-label="Scheme name" />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="small">Every</span>
          <input className="input" type="number" min={2} max={50} value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 80 }} aria-label="How many" />
          {kind === 'stamps' ? (
            <input className="input grow" maxLength={30} placeholder="coffees" value={item} onChange={(e) => setItem(e.target.value)} aria-label="What earns a stamp" style={{ minWidth: 140 }} />
          ) : (
            <span className="small">visits</span>
          )}
          <span className="small">gets</span>
          <input className="input grow" maxLength={80} placeholder="a free coffee" value={reward} onChange={(e) => setReward(e.target.value)} aria-label="Reward" style={{ minWidth: 180 }} />
        </div>
        <button className="btn btn-primary btn-sm" type="submit" style={{ alignSelf: 'flex-start' }} disabled={!name.trim() || !reward.trim()}>Add scheme</button>
        {msg && <span className="small" role="status">{msg}</span>}
      </form>
    </div>
  );
}
