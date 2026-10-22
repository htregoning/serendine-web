'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { LoyaltyKind } from '@/lib/loyalty';

type Row = {
  guest_name: string; visited_today: boolean; scheme_id: string | null; scheme: string | null; kind: LoyaltyKind | null;
  item: string | null; target: number | null; reward: string | null; progress: number | null; ready: number | null;
};

// Staff: one guest's loyalty cards at this venue, from their pass. +1, undo, redeem, or just count today's visit.
export default function PassStaff({ code, venueId, venueName, venueSlug }: { code: string; venueId: string; venueName: string; venueSlug: string }) {
  const [supabase] = useState(() => createClient());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [undoable, setUndoable] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('staff_pass', { p_code: code, v: venueId });
    if (error) return setMsg(error.message);
    setRows((data as Row[] | null) ?? []);
  }, [supabase, code, venueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string, after?: () => void) {
    setBusy(true);
    setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) return setMsg(error.message);
    setMsg(ok);
    after?.();
    load();
  }

  if (!rows) return <main className="shell"><p className="small">{msg ?? 'Loading…'}</p></main>;
  const name = rows[0]?.guest_name ?? 'Guest';
  const cards = rows.filter((r) => r.scheme_id);
  const today = rows[0]?.visited_today;

  return (
    <main className="shell">
      <a className="small" href={`/staff?v=${venueSlug}`} style={{ alignSelf: 'flex-start' }}>‹ Staff screen</a>
      <div className="col" style={{ gap: 4 }}>
        <span className="eyebrow">{venueName} · Serendine pass</span>
        <h1 className="display" style={{ fontSize: 30, margin: 0 }}>{name}</h1>
        <span className="small">{today ? 'Visit counted today ✓' : 'Not counted today yet'}</span>
      </div>

      {cards.length === 0 && (
        <p className="card small">
          No loyalty schemes are running here yet. A manager can add one under Loyalty on the staff screen.
        </p>
      )}

      {cards.map((r) => (
        <div key={r.scheme_id!} className={(r.ready ?? 0) > 0 ? 'loyalty-card ready' : 'loyalty-card'}>
          <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
            <strong className="grow" style={{ fontSize: 18 }}>{r.scheme}</strong>
            <span style={{ fontWeight: 700 }}>{r.progress}/{r.target}</span>
          </div>
          <div className="loyalty-dots" aria-hidden="true">
            {Array.from({ length: r.target ?? 0 }, (_, i) => <span key={i} className={i < (r.progress ?? 0) ? 'on' : ''} />)}
          </div>
          {(r.ready ?? 0) > 0 && <strong style={{ color: 'var(--accent)' }}>Reward ready: {r.reward}</strong>}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {r.kind === 'stamps' && (
              <>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => act(() => supabase.rpc('pass_stamp', { p_code: code, v: venueId, p_scheme: r.scheme_id, p_qty: 1 }), `+1 ${r.item ?? 'stamp'} added.`, () => setUndoable(r.scheme_id))}
                >
                  +1 {r.item ?? ''}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => act(() => supabase.rpc('pass_stamp', { p_code: code, v: venueId, p_scheme: r.scheme_id, p_qty: 2 }), `+2 ${r.item ?? 'stamps'} added.`, () => setUndoable(r.scheme_id))}
                >
                  +2
                </button>
              </>
            )}
            {(r.ready ?? 0) > 0 && (
              <button className="btn btn-primary" disabled={busy} onClick={() => act(() => supabase.rpc('pass_redeem', { p_code: code, v: venueId, p_scheme: r.scheme_id }), 'Reward redeemed.')}>
                Redeem
              </button>
            )}
            {undoable === r.scheme_id && (
              <button className="link-quiet small" disabled={busy} onClick={() => act(() => supabase.rpc('pass_undo', { p_code: code, v: venueId, p_scheme: r.scheme_id }), 'Last stamp taken back.', () => setUndoable(null))}>
                Undo
              </button>
            )}
          </div>
          {r.kind === 'visits' && <span className="small">Visits count automatically: one a day.</span>}
        </div>
      ))}

      {!today && (
        <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => supabase.rpc('pass_checkin', { p_code: code, v: venueId }), 'Visit counted.')}>
          Count today&apos;s visit only
        </button>
      )}
      {msg && <p className="small" role="status" style={{ margin: 0 }}>{msg}</p>}
    </main>
  );
}
