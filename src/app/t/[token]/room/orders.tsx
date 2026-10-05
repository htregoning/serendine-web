'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { useT } from '@/components/lang';
import OrderCard from '@/components/order-card';
import { alertGuest } from '@/lib/alerts';
import { notify } from '@/lib/push';
import { STATUS_GUEST, byCategory, money, type Basket, type MenuItem, type TableOrder } from '@/lib/orders';

type Client = ReturnType<typeof createClient>;

// Ordering from the table: the menu with a basket, and this table's orders live,
// with anything the staff changed highlighted for the table to confirm.
export default function TableOrders({ supabase, venueId, tableId, currency }: { supabase: Client; venueId: string; tableId: string; currency: string }) {
  const t = useT();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<TableOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [basket, setBasket] = useState<Basket>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<Record<string, string>>({});

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_table_orders');
    if (error) return;
    const list = (data as TableOrder[] | null) ?? [];
    // A nudge when the staff change an order or it's ready.
    const before = statusRef.current;
    if (list.some((o) => before[o.id] && before[o.id] !== o.status && (o.status === 'changed' || o.status === 'ready'))) alertGuest('update');
    statusRef.current = Object.fromEntries(list.map((o) => [o.id, o.status]));
    setOrders(list);
  }, [supabase]);

  const loadMenu = useCallback(async () => {
    const { data } = await supabase
      .from('menu_items')
      .select('id, category, name, description, price, available, sort')
      .eq('venue_id', venueId)
      .order('sort');
    setMenu((data as MenuItem[] | null) ?? []);
  }, [supabase, venueId]);

  useEffect(() => {
    loadOrders();
    loadMenu();
    const channel = supabase
      .channel(`orders-${tableId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_orders', filter: `table_id=eq.${tableId}` }, () => loadOrders())
      .subscribe();
    const poll = setInterval(loadOrders, 10000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [supabase, tableId, loadOrders, loadMenu]);

  const count = Object.values(basket).reduce((n, b) => n + b.qty, 0);
  const total = Object.entries(basket).reduce((sum, [id, b]) => sum + (Number(menu.find((m) => m.id === id)?.price) || 0) * b.qty, 0);

  function step(id: string, d: number) {
    setBasket((b) => {
      const qty = Math.max(0, Math.min(50, (b[id]?.qty ?? 0) + d));
      const next = { ...b };
      if (qty === 0) delete next[id];
      else next[id] = { ...b[id], qty };
      return next;
    });
  }

  async function send() {
    if (count === 0) return;
    setBusy(true);
    setError(null);
    const lines = Object.entries(basket).map(([item, b]) => ({ item, qty: b.qty, note: b.note ?? null }));
    const { data, error } = await supabase.rpc('place_order', { p_lines: lines, p_note: note.trim() || null });
    setBusy(false);
    if (error) {
      const m = error.message;
      return setError(/sold out|not on the menu|Slow down|not switched on/.test(m) ? m : t('That did not send. Please try again.'));
    }
    notify('order', data as string);
    setBasket({});
    setNote('');
    setOpen(false);
    loadOrders();
  }

  async function confirm(id: string) {
    const { error } = await supabase.rpc('confirm_order_changes', { p_order: id });
    if (error) setError(t('That did not work. Please try again.'));
    loadOrders();
  }

  async function cancel(id: string) {
    const { error } = await supabase.rpc('cancel_my_order', { p_order: id });
    if (error) setError(error.message);
    loadOrders();
  }

  const available = menu.filter((m) => m.available);
  if (available.length === 0 && orders.length === 0) return null;

  return (
    <div className="col" style={{ gap: 10 }}>
      {orders.length > 0 && (
        <div className="col" style={{ gap: 10 }}>
          <span className="eyebrow">{t("Your table's orders")}</span>
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              translate
              header={
                <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{t(STATUS_GUEST[o.status])}</strong>
                  <span className="small">{o.placed_by === 'staff' && o.staff_name ? t('Taken by {name}', { name: o.staff_name }) : ''}</span>
                </div>
              }
            >
              {o.status === 'changed' && (
                <div className="col" style={{ gap: 6 }}>
                  <span className="small">{t('Changes are highlighted. Confirm them, or ask a waiter if something is wrong.')}</span>
                  <button className="btn btn-primary btn-sm" onClick={() => confirm(o.id)}>{t('Confirm changes')}</button>
                </div>
              )}
              {o.status === 'sent' && (
                <button className="link-danger" style={{ alignSelf: 'flex-start' }} onClick={() => cancel(o.id)}>{t('Cancel this order')}</button>
              )}
            </OrderCard>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          {t('Order food and drinks')}
        </button>
      )}
      {error && !open && <p className="error" role="status" style={{ margin: 0 }}>{error}</p>}

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet order-sheet" role="dialog" aria-modal="true" aria-labelledby="order-title" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-grip" aria-hidden="true" />
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="order-title" className="display" style={{ margin: 0, fontSize: 24 }}>{t('Order')}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>{t('Close')}</button>
            </div>
            {byCategory(available).map((g) => (
              <section key={g.category} className="col" style={{ gap: 0 }}>
                <span className="eyebrow" style={{ padding: '4px 2px 6px' }}>{g.category}</span>
                {g.items.map((it) => {
                  const q = basket[it.id]?.qty ?? 0;
                  return (
                    <div key={it.id} className="row menu-pick">
                      <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                        <strong style={{ fontSize: 15 }}>{it.name}</strong>
                        {it.description && <span className="small">{it.description}</span>}
                        <span className="small" style={{ color: 'var(--text-2)' }}>{money(it.price, currency)}</span>
                      </div>
                      {q > 0 ? (
                        <span className="row" style={{ gap: 6 }}>
                          <button className="qty-btn" onClick={() => step(it.id, -1)} aria-label={t('One less')}>−</button>
                          <strong style={{ minWidth: 18, textAlign: 'center' }}>{q}</strong>
                          <button className="qty-btn" onClick={() => step(it.id, 1)} aria-label={t('One more')}>+</button>
                        </span>
                      ) : (
                        <button className="btn btn-outline btn-sm" onClick={() => step(it.id, 1)}>{t('Add')}</button>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}
            <label htmlFor="order-note" className="label">{t('Note for the staff (optional)')}</label>
            <input id="order-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. no nuts, sharing plates')} />
            {error && <p className="error" role="status" style={{ margin: 0 }}>{error}</p>}
            <div className="order-send">
              <span className="col" style={{ gap: 0 }}>
                <strong>{money(total, currency)}</strong>
                <span className="small">{t('{n} items · pay your server as usual', { n: count })}</span>
              </span>
              <button className="btn btn-primary grow" onClick={send} disabled={busy || count === 0}>
                {busy ? t('Sending…') : t('Send order to the staff')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
