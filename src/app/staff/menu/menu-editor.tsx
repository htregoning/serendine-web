'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { byCategory, money, parseMenuText, type MenuItem } from '@/lib/orders';
import type { PageVenue } from '../venue-for-page';

// Managers keep the menu here; any staff member can mark items sold out.
export default function MenuEditor({ venue, initial }: { venue: PageVenue; initial: MenuItem[] }) {
  const [supabase] = useState(() => createClient());
  const [items, setItems] = useState<MenuItem[]>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ category: initial[initial.length - 1]?.category ?? 'Mains', name: '', price: '', description: '' });
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(initial.length === 0);
  const isManager = venue.role === 'manager';

  async function reload() {
    const { data } = await supabase
      .from('menu_items')
      .select('id, category, name, description, price, available, sort')
      .eq('venue_id', venue.id)
      .order('sort');
    setItems((data as MenuItem[]) ?? []);
  }

  async function add() {
    const price = Number(draft.price);
    if (!draft.name.trim() || !Number.isFinite(price) || price < 0) return setMsg('Add a name and a price.');
    setBusy(true);
    const { error } = await supabase.from('menu_items').insert({
      venue_id: venue.id,
      category: draft.category.trim() || 'Menu',
      name: draft.name.trim(),
      price,
      description: draft.description.trim() || null,
      sort: items.length,
    });
    setBusy(false);
    if (error) return setMsg('That did not save. Only managers can change the menu.');
    setDraft({ ...draft, name: '', price: '', description: '' });
    setMsg(null);
    reload();
  }

  async function importText() {
    const rows = parseMenuText(paste);
    if (rows.length === 0) return setMsg('Nothing to add. Use one item per line: Name | Price (with a category line above).');
    setBusy(true);
    const { error } = await supabase
      .from('menu_items')
      .insert(rows.map((r, i) => ({ ...r, venue_id: venue.id, sort: items.length + i })));
    setBusy(false);
    if (error) return setMsg('That did not save. Check the prices are numbers.');
    setPaste('');
    setShowPaste(false);
    setMsg(`Added ${rows.length} item${rows.length === 1 ? '' : 's'}.`);
    reload();
  }

  async function toggle(it: MenuItem) {
    setItems((list) => list.map((x) => (x.id === it.id ? { ...x, available: !x.available } : x)));
    const { error } = await supabase.rpc('set_item_available', { p_item: it.id, p_available: !it.available });
    if (error) {
      setMsg('That did not save.');
      reload();
    }
  }

  async function update(it: MenuItem, patch: Partial<MenuItem>) {
    const { error } = await supabase.from('menu_items').update(patch).eq('id', it.id);
    if (error) setMsg('That did not save.');
    reload();
  }

  async function remove(it: MenuItem) {
    const { error } = await supabase.from('menu_items').delete().eq('id', it.id);
    if (error) setMsg('That did not delete.');
    reload();
  }

  return (
    <main className="staff col" style={{ gap: 18, maxWidth: 900 }}>
      <div className="row">
        <div className="col grow" style={{ gap: 2 }}>
          <span className="display" style={{ fontSize: 26 }}>Menu for ordering</span>
          <span className="small">{venue.name} · prices in {venue.currency}</span>
        </div>
        <Link className="btn btn-ghost btn-sm" href={`/staff?v=${venue.slug}`} style={{ textDecoration: 'none' }}>Back to staff screen</Link>
      </div>
      <p className="small" style={{ margin: 0 }}>
        Guests order from this list and staff can add from it. Tap &ldquo;Sold out&rdquo; when the kitchen runs out: guests can&apos;t order it
        until you switch it back.
      </p>
      {msg && <p className="card small" role="status" style={{ margin: 0 }}>{msg}</p>}

      {isManager && (
        <div className="card col" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Add an item</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPaste((s) => !s)}>{showPaste ? 'Add one at a time' : 'Paste a whole menu'}</button>
          </div>
          {showPaste ? (
            <>
              <span className="small">
                One item per line as <b>Name | Price</b>, with a category on its own line above. You can also add a description:{' '}
                <b>Name | Price | Description</b>. Copying from a spreadsheet works too.
              </span>
              <textarea
                className="input"
                style={{ height: 180, paddingTop: 10, fontFamily: 'ui-monospace, monospace', fontSize: 14 }}
                placeholder={'Starters\nHummus | 32\nHalloumi fries | 38 | With pomegranate\n\nMains\nLamb shoulder | 120 | Slow-cooked, for two'}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <span className="small">{parseMenuText(paste).length} items ready to add</span>
              <button className="btn btn-primary btn-sm" onClick={importText} disabled={busy || !paste.trim()}>Add these items</button>
            </>
          ) : (
            <div className="menu-add">
              <input className="input" placeholder="Category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} aria-label="Category" />
              <input className="input" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Name" />
              <input className="input" placeholder="Price" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} aria-label="Price" />
              <input className="input" placeholder="Description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Description" />
              <button className="btn btn-primary btn-sm" onClick={add} disabled={busy}>Add</button>
            </div>
          )}
        </div>
      )}

      {items.length === 0 && <p className="card small">No items yet.</p>}
      {byCategory(items).map((g) => (
        <section key={g.category} className="col" style={{ gap: 0 }}>
          <span className="eyebrow" style={{ padding: '0 2px 8px' }}>{g.category}</span>
          {g.items.map((it) => (
            <div key={it.id} className="row menu-row" data-off={!it.available}>
              <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                {isManager ? (
                  <input
                    className="menu-inline"
                    defaultValue={it.name}
                    aria-label="Name"
                    onBlur={(e) => e.target.value.trim() && e.target.value !== it.name && update(it, { name: e.target.value.trim() })}
                  />
                ) : (
                  <strong>{it.name}</strong>
                )}
                {it.description && <span className="small">{it.description}</span>}
              </div>
              {isManager ? (
                <input
                  className="menu-inline menu-price"
                  defaultValue={String(it.price)}
                  inputMode="decimal"
                  aria-label="Price"
                  onBlur={(e) => {
                    const p = Number(e.target.value);
                    if (Number.isFinite(p) && p >= 0 && p !== Number(it.price)) update(it, { price: p });
                  }}
                />
              ) : (
                <span>{money(it.price, venue.currency)}</span>
              )}
              <button className={it.available ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'} onClick={() => toggle(it)}>
                {it.available ? 'Sold out' : 'Back on'}
              </button>
              {isManager && (
                <button className="link-danger" onClick={() => remove(it)} aria-label={`Delete ${it.name}`}>Delete</button>
              )}
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
