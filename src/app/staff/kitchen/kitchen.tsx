'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { playSound, unlockAudio } from '@/lib/alerts';
import { notify } from '@/lib/push';
import type { OrderStatus, TableOrder } from '@/lib/orders';

const COLUMNS: { status: OrderStatus; title: string; next?: { to: OrderStatus; label: string } }[] = [
  { status: 'accepted', title: 'New', next: { to: 'preparing', label: 'Start' } },
  { status: 'preparing', title: 'Preparing', next: { to: 'ready', label: 'Ready' } },
  { status: 'ready', title: 'Ready to go out' },
];

function mins(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

// Confirmed orders only (not ones still waiting for staff or the table), big and simple for the pass.
export default function Kitchen({ venueId, venueName, slug }: { venueId: string; venueName: string; slug: string }) {
  const [supabase] = useState(() => createClient());
  const [orders, setOrders] = useState<TableOrder[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('venue_orders', { v: venueId });
    if (error) return setOrders([]);
    const list = ((data as TableOrder[] | null) ?? []).filter((o) => ['accepted', 'preparing', 'ready'].includes(o.status));
    const fresh = list.filter((o) => o.status === 'accepted').map((o) => o.id);
    if (seen.current && fresh.some((id) => !seen.current!.has(id))) playSound('staff');
    seen.current = new Set(fresh);
    setOrders(list);
  }, [supabase, venueId]);

  useEffect(() => {
    unlockAudio();
    load();
    const channel = supabase
      .channel(`kitchen-${venueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_orders', filter: `venue_id=eq.${venueId}` }, () => load())
      .subscribe();
    const poll = setInterval(load, 10000);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      supabase.removeChannel(channel);
    };
  }, [supabase, venueId, load]);

  async function move(o: TableOrder, to: OrderStatus) {
    setOrders((list) => (list ?? []).map((x) => (x.id === o.id ? { ...x, status: to } : x)));
    const { error } = await supabase.rpc('set_order_status', { p_order: o.id, p_status: to });
    if (!error && to === 'ready') notify('order', o.id);
    load();
  }

  return (
    <main className="kitchen">
      <header className="row" style={{ gap: 12 }}>
        <div className="col grow" style={{ gap: 2 }}>
          <span className="display" style={{ fontSize: 26 }}>Kitchen</span>
          <span className="small">{venueName} · new orders beep · tap the screen once to allow sound</span>
        </div>
        <Link className="btn btn-ghost btn-sm" href={`/staff?v=${slug}`} style={{ textDecoration: 'none' }}>Staff screen</Link>
      </header>
      {orders === null ? null : (
        <div className="kitchen-cols">
          {COLUMNS.map((c) => {
            const list = orders.filter((o) => o.status === c.status);
            return (
              <section key={c.status} className="col" style={{ gap: 12 }} aria-label={c.title}>
                <h2 className="kitchen-col-title">{c.title} · {list.length}</h2>
                {list.map((o) => {
                  const m = mins(o.updated_at, now);
                  return (
                    <div key={o.id} className={`kitchen-ticket ${m >= 20 && c.status !== 'ready' ? 'late' : m >= 10 && c.status !== 'ready' ? 'amber' : ''}`}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="display" style={{ fontSize: 28 }}>Table {o.table_label}</span>
                        <span className="small">{m} min</span>
                      </div>
                      <ul className="kitchen-lines">
                        {o.lines.filter((l) => l.qty > 0).map((l) => (
                          <li key={l.id}>
                            <b>{l.qty}×</b> {l.name}
                            {l.note && <span className="kitchen-note"> · {l.note}</span>}
                          </li>
                        ))}
                      </ul>
                      {o.note && <p className="kitchen-note" style={{ margin: 0 }}>&ldquo;{o.note}&rdquo;</p>}
                      {c.next && (
                        <button className="btn btn-primary" onClick={() => move(o, c.next!.to)}>{c.next.label}</button>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
