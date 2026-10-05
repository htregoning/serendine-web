'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import OrderCard from '@/components/order-card';
import { playSound } from '@/lib/alerts';
import { notify } from '@/lib/push';
import { STATUS_STAFF, byCategory, money, type Basket, type MenuItem, type OrderStatus, type TableOrder } from '@/lib/orders';

type Client = ReturnType<typeof createClient>;

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : `${m} min ago`;
}

// Orders from tables (and ones staff take), on the staff screen.
export default function OrdersPanel({ supabase, venueId, tables }: { supabase: Client; venueId: string; tables: Record<string, string> }) {
  const [orders, setOrders] = useState<TableOrder[] | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [addItem, setAddItem] = useState('');
  const [taking, setTaking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('venue_orders', { v: venueId });
    if (error) return setOrders(null); // before update 0024
    const list = ((data as TableOrder[] | null) ?? []).filter((o) => o.status !== 'served' && o.status !== 'cancelled');
    const fresh = list.filter((o) => o.status === 'sent').map((o) => o.id);
    if (seen.current && fresh.some((id) => !seen.current!.has(id))) playSound('staff');
    seen.current = new Set(fresh);
    setOrders(list);
  }, [supabase, venueId]);

  const loadMenu = useCallback(async () => {
    const { data } = await supabase
      .from('menu_items')
      .select('id, category, name, description, price, available, sort')
      .eq('venue_id', venueId)
      .order('sort');
    setMenu((data as MenuItem[] | null) ?? []);
  }, [supabase, venueId]);

  useEffect(() => {
    load();
    loadMenu();
    const channel = supabase
      .channel(`orders-staff-${venueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_orders', filter: `venue_id=eq.${venueId}` }, () => load())
      .subscribe();
    const poll = setInterval(load, 10000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [supabase, venueId, load, loadMenu]);

  async function status(o: TableOrder, s: OrderStatus) {
    setMsg(null);
    const { error } = await supabase.rpc('set_order_status', { p_order: o.id, p_status: s });
    if (error) setMsg(error.message);
    if (!error && s === 'ready') notify('order', o.id);
    load();
  }

  async function change(o: TableOrder, set: { line: string; qty: number }[], add: { item: string; qty: number }[]) {
    setMsg(null);
    const { error } = await supabase.rpc('staff_change_order', { p_order: o.id, p_set: set, p_add: add });
    if (error) setMsg(error.message);
    else notify('order', o.id);
    load();
  }

  if (!orders) return null;
  const available = menu.filter((m) => m.available);
  if (orders.length === 0 && menu.length === 0) return null;

  return (
    <section className="col" style={{ gap: 12 }} aria-label="Orders">
      <div className="row" style={{ gap: 12, alignItems: 'baseline' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Orders</h1>
        <span className="small grow">{orders.length} open</span>
        {available.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setTaking(true)}>Take an order</button>
        )}
      </div>
      {msg && <p className="error" role="status" style={{ margin: 0 }}>{msg}</p>}
      {taking && <TakeOrder supabase={supabase} menu={available} tables={tables} onDone={() => { setTaking(false); load(); }} />}
      {orders.length === 0 && !taking && <p className="card small" style={{ textAlign: 'center', padding: 24 }}>No open orders.</p>}
      {orders.map((o) => {
        const canEdit = ['sent', 'changed', 'accepted'].includes(o.status);
        const isEditing = editing === o.id && canEdit;
        return (
          <OrderCard
            key={o.id}
            order={o}
            onQty={isEditing ? (line, qty) => change(o, [{ line, qty }], []) : undefined}
            header={
              <div className="row" style={{ gap: 12 }}>
                <div className="table-tile" style={{ width: 60, height: 60, background: o.status === 'sent' ? 'var(--accent)' : 'var(--line)', color: o.status === 'sent' ? 'var(--on-accent)' : 'var(--text)' }}>
                  <span style={{ fontSize: 10, fontWeight: 700 }}>TABLE</span>
                  <span className="display" style={{ fontSize: 24, lineHeight: 1 }}>{o.table_label}</span>
                </div>
                <div className="col grow" style={{ gap: 2 }}>
                  <strong>{STATUS_STAFF[o.status]}</strong>
                  <span className="small">
                    {o.placed_by === 'staff' ? `Taken by ${o.staff_name ?? 'staff'}` : 'From the table'} · {ago(o.created_at)}
                  </span>
                </div>
              </div>
            }
          >
            {isEditing && available.length > 0 && (
              <div className="row" style={{ gap: 8 }}>
                <select className="input grow" value={addItem} onChange={(e) => setAddItem(e.target.value)} aria-label="Add an item">
                  <option value="">Add an item…</option>
                  {byCategory(available).map((g) => (
                    <optgroup key={g.category} label={g.category}>
                      {g.items.map((it) => (
                        <option key={it.id} value={it.id}>{it.name} · {money(it.price, o.currency)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button className="btn btn-ghost btn-sm" disabled={!addItem} onClick={() => { change(o, [], [{ item: addItem, qty: 1 }]); setAddItem(''); }}>Add</button>
              </div>
            )}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {o.status === 'sent' && <button className="btn btn-primary btn-sm grow" onClick={() => status(o, 'accepted')}>Accept · send to kitchen</button>}
              {o.status === 'ready' && <button className="btn btn-primary btn-sm grow" onClick={() => status(o, 'served')}>Served</button>}
              {canEdit && (
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(isEditing ? null : o.id)}>{isEditing ? 'Done changing' : 'Change'}</button>
              )}
              {canEdit && <button className="link-danger" onClick={() => status(o, 'cancelled')}>Cancel order</button>}
            </div>
            {isEditing && o.placed_by === 'guest' && (
              <span className="small">The table sees each change highlighted and confirms it before it goes to the kitchen.</span>
            )}
          </OrderCard>
        );
      })}
    </section>
  );
}

// A waiter takes an order at the table and sends it straight to the kitchen.
function TakeOrder({ supabase, menu, tables, onDone }: { supabase: Client; menu: MenuItem[]; tables: Record<string, string>; onDone: () => void }) {
  const [table, setTable] = useState('');
  const [basket, setBasket] = useState<Basket>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = (id: string, d: number) =>
    setBasket((b) => {
      const qty = Math.max(0, Math.min(50, (b[id]?.qty ?? 0) + d));
      const next = { ...b };
      if (qty === 0) delete next[id];
      else next[id] = { qty };
      return next;
    });
  const count = Object.values(basket).reduce((n, b) => n + b.qty, 0);

  async function send() {
    if (!table || count === 0) return setError('Pick a table and at least one item.');
    setBusy(true);
    const lines = Object.entries(basket).map(([item, b]) => ({ item, qty: b.qty }));
    const { error } = await supabase.rpc('staff_place_order', { p_table: table, p_lines: lines, p_note: note.trim() || null });
    setBusy(false);
    if (error) return setError(error.message);
    onDone();
  }

  const sortedTables = Object.entries(tables).sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
  return (
    <div className="card col" style={{ gap: 10, borderColor: 'var(--accent)', borderWidth: 2 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Take an order</strong>
        <button className="btn btn-ghost btn-sm" onClick={onDone}>Close</button>
      </div>
      <select className="input" value={table} onChange={(e) => setTable(e.target.value)} aria-label="Table">
        <option value="">Which table?</option>
        {sortedTables.map(([id, label]) => (
          <option key={id} value={id}>Table {label}</option>
        ))}
      </select>
      <div className="col take-menu" style={{ gap: 0 }}>
        {byCategory(menu).map((g) => (
          <div key={g.category} className="col" style={{ gap: 0 }}>
            <span className="eyebrow" style={{ padding: '8px 2px 4px' }}>{g.category}</span>
            {g.items.map((it) => {
              const q = basket[it.id]?.qty ?? 0;
              return (
                <div key={it.id} className="row menu-pick">
                  <span className="grow">{it.name}</span>
                  <button className="qty-btn" onClick={() => step(it.id, -1)} disabled={q === 0} aria-label={`One less ${it.name}`}>−</button>
                  <strong style={{ minWidth: 20, textAlign: 'center' }}>{q}</strong>
                  <button className="qty-btn" onClick={() => step(it.id, 1)} aria-label={`One more ${it.name}`}>+</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <input className="input" placeholder="Note for the kitchen (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      <button className="btn btn-primary btn-sm" onClick={send} disabled={busy}>{busy ? 'Sending…' : `Send ${count} item${count === 1 ? '' : 's'} to the kitchen`}</button>
    </div>
  );
}
