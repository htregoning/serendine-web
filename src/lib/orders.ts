// Table ordering: shared types and small helpers for the guest, staff and kitchen screens.

export type MenuItem = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  sort: number;
};

export type OrderLine = {
  id: string;
  name: string;
  price: number;
  qty: number;
  note: string | null;
  change: 'added' | 'removed' | 'qty' | null;
};

export type OrderStatus = 'sent' | 'changed' | 'accepted' | 'preparing' | 'ready' | 'served' | 'cancelled';

export type TableOrder = {
  id: string;
  table_id: string;
  table_label: string;
  placed_by: 'guest' | 'staff';
  staff_name: string | null;
  status: OrderStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  lines: OrderLine[];
  currency: string;
};

// What a basket line is before it's sent: menu item id → quantity and note.
export type Basket = Record<string, { qty: number; note?: string }>;

export function money(amount: number, currency = 'AED') {
  const n = Number(amount);
  return `${currency} ${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export function orderTotal(lines: Pick<OrderLine, 'price' | 'qty'>[]) {
  return lines.reduce((sum, l) => sum + Number(l.price) * l.qty, 0);
}

export const STATUS_GUEST: Record<OrderStatus, string> = {
  sent: 'Sent · waiting for the staff',
  changed: 'The staff changed your order: please check',
  accepted: 'Confirmed · with the kitchen',
  preparing: 'Being prepared',
  ready: 'Ready · on its way',
  served: 'Served',
  cancelled: 'Cancelled',
};

export const STATUS_STAFF: Record<OrderStatus, string> = {
  sent: 'New from the table',
  changed: 'Waiting for the table to confirm changes',
  accepted: 'With the kitchen',
  preparing: 'Preparing',
  ready: 'Ready to serve',
  served: 'Served',
  cancelled: 'Cancelled',
};

// Group menu items by category, keeping the manager's order.
export function byCategory(items: MenuItem[]) {
  const groups: { category: string; items: MenuItem[] }[] = [];
  for (const it of [...items].sort((a, b) => a.sort - b.sort)) {
    let g = groups.find((x) => x.category === it.category);
    if (!g) groups.push((g = { category: it.category, items: [] }));
    g.items.push(it);
  }
  return groups;
}

// "Mains | Lamb shoulder | 120 | Slow-cooked, for two" (one item per line) → items to import.
export function parseMenuText(text: string) {
  const out: { category: string; name: string; price: number; description: string | null }[] = [];
  let category = 'Menu';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s*[|\t]\s*/);
    if (parts.length === 1) {
      // A line on its own is a category heading ("Desserts").
      category = parts[0].replace(/:$/, '').slice(0, 40);
      continue;
    }
    // Accepts "Name | Price", "Name | Price | Description" or "Category | Name | Price | Description".
    const isPrice = (x: string | undefined) => !!x && /\d/.test(x) && /^[^a-z]*\d[\d.,]*\s*[^a-z]*$/i.test(x.replace(/^(aed|usd|eur|gbp|sar|dhs?)\s*/i, ''));
    let cat = category;
    let name: string;
    let priceText: string;
    let desc: string | undefined;
    if (isPrice(parts[1])) [name, priceText, desc] = [parts[0], parts[1], parts[2]];
    else if (isPrice(parts[2])) [cat, name, priceText, desc] = [parts[0], parts[1], parts[2], parts[3]];
    else continue;
    const price = Number(priceText.replace(/[^0-9.]/g, ''));
    if (!name || !Number.isFinite(price)) continue;
    out.push({ category: (cat || category).slice(0, 40), name: name.slice(0, 80), price, description: desc ? desc.slice(0, 200) : null });
  }
  return out;
}
