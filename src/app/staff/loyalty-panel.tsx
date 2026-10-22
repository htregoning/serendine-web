'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import type { LoyaltyKind } from '@/lib/loyalty';

type Client = ReturnType<typeof createClient>;
type Row = {
  visit_id: string; alias: string; table_label: string; zone: string; scheme_id: string; scheme: string; kind: LoyaltyKind;
  item: string | null; target: number; reward: string; progress: number; ready: number;
};

// Staff: guests here now with their loyalty cards. +1 adds a stamp; Redeem when the reward is handed over.
export default function LoyaltyPanel({ supabase, venueId }: { supabase: Client; venueId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [table, setTable] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [lastStamp, setLastStamp] = useState<{ scheme: string; visit: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('venue_loyalty_now', { v: venueId });
    setRows(error ? null : ((data as Row[] | null) ?? []));
  }, [supabase, venueId]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 20000);
    return () => clearInterval(poll);
  }, [load]);

  const tables = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.table_label))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [rows]);
  const readyCount = (rows ?? []).filter((r) => r.ready > 0).length;

  if (!rows || rows.length === 0) return null; // no schemes, or nobody checked in

  const shown = rows.filter((r) => (table ? r.table_label === table : r.ready > 0));
  const guests = Array.from(new Map(shown.map((r) => [r.visit_id, r])).values());

  async function act(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, after?: () => void) {
    setBusy(key);
    setMsg(null);
    const { error } = await fn();
    setBusy(null);
    if (error) return setMsg(error.message);
    after?.();
    load();
  }

  return (
    <section className="card col" style={{ gap: 12 }} aria-label="Loyalty">
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <strong className="grow">Loyalty</strong>
        {readyCount > 0 && <span className="pill plan-trial">{readyCount} reward{readyCount === 1 ? '' : 's'} ready</span>}
      </div>
      <div className="chips">
        <button className="chip" aria-pressed={table === ''} onClick={() => setTable('')}>Rewards ready</button>
        {tables.map((tl) => (
          <button key={tl} className="chip" aria-pressed={table === tl} onClick={() => setTable(tl)}>Table {tl}</button>
        ))}
      </div>
      {guests.length === 0 && (
        <span className="small">{table ? 'Nobody checked in at this table.' : 'No rewards waiting. Pick a table to add stamps.'}</span>
      )}
      {guests.map((g) => (
        <div key={g.visit_id} className="col" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <strong>{g.alias} <span className="small" style={{ fontWeight: 400 }}>· Table {g.table_label}</span></strong>
          {shown.filter((r) => r.visit_id === g.visit_id).map((r) => {
            const key = `${r.scheme_id}:${r.visit_id}`;
            return (
              <div key={key} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="grow small" style={{ color: 'var(--text)' }}>
                  {r.scheme} · {r.progress}/{r.target}
                  {r.ready > 0 && <b style={{ color: 'var(--accent)' }}> · Reward ready: {r.reward}</b>}
                </span>
                {r.kind === 'stamps' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy === key}
                    onClick={() => act(key, () => supabase.rpc('add_loyalty_stamp', { p_scheme: r.scheme_id, p_visit: r.visit_id, p_qty: 1 }), () => setLastStamp({ scheme: r.scheme_id, visit: r.visit_id }))}
                  >
                    +1 {r.item ?? ''}
                  </button>
                )}
                {lastStamp?.scheme === r.scheme_id && lastStamp.visit === r.visit_id && (
                  <button className="link-quiet small" onClick={() => act(key, () => supabase.rpc('undo_loyalty_stamp', { p_scheme: r.scheme_id, p_visit: r.visit_id }), () => setLastStamp(null))}>
                    Undo
                  </button>
                )}
                {r.ready > 0 && (
                  <button className="btn btn-primary btn-sm" disabled={busy === key} onClick={() => act(key, () => supabase.rpc('redeem_loyalty', { p_scheme: r.scheme_id, p_visit: r.visit_id }))}>
                    Redeem
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {msg && <p className="error small" role="status" style={{ margin: 0 }}>{msg}</p>}
    </section>
  );
}
