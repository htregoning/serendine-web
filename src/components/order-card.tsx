'use client';

import { useT } from '@/components/lang';
import { money, orderTotal, type TableOrder } from '@/lib/orders';

type Props = {
  order: TableOrder;
  // Staff can change quantities until the kitchen starts.
  onQty?: (lineId: string, qty: number) => void;
  translate?: boolean;
  children?: React.ReactNode;
  header?: React.ReactNode;
};

// One order with its lines. Lines staff changed are highlighted until the table confirms.
export default function OrderCard({ order, onQty, translate = false, children, header }: Props) {
  const t = useT();
  const tr = (s: string) => (translate ? t(s) : s);
  const live = order.lines.filter((l) => l.qty > 0);
  return (
    <div className={`card col order-card order-${order.status}`} style={{ gap: 10 }}>
      {header}
      <ul className="order-lines">
        {order.lines.map((l) => (
          <li key={l.id} className={l.change ? `order-line change-${l.change}` : 'order-line'}>
            <span className="order-qty">{l.qty > 0 ? `${l.qty}×` : ''}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="order-name">{l.name}</span>
              {l.note && <span className="small"> · {l.note}</span>}
              {l.change && (
                <span className="order-change">
                  {l.change === 'added' ? tr('Added') : l.change === 'removed' ? tr('Removed') : tr('Changed')}
                </span>
              )}
            </span>
            {onQty && l.qty > 0 ? (
              <span className="row" style={{ gap: 4 }}>
                <button className="qty-btn" onClick={() => onQty(l.id, l.qty - 1)} aria-label={`One less ${l.name}`}>−</button>
                <button className="qty-btn" onClick={() => onQty(l.id, l.qty + 1)} aria-label={`One more ${l.name}`}>+</button>
              </span>
            ) : (
              <span className="small order-price">{l.qty > 0 ? money(l.price * l.qty, order.currency) : ''}</span>
            )}
          </li>
        ))}
      </ul>
      {order.note && <span className="small">&ldquo;{order.note}&rdquo;</span>}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small">{tr('Total')}</span>
        <strong>{money(orderTotal(live), order.currency)}</strong>
      </div>
      {children}
    </div>
  );
}
