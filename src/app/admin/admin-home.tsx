'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Logo from '@/components/logo';

export type AdminVenue = {
  id: string;
  slug: string;
  name: string;
  tables: number;
  team: number;
  guests_now: number;
  my_role: string;
  created_at: string;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export default function AdminHome({ isAdmin, venues, email }: { isAdmin: boolean; venues: AdminVenue[]; email: string }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [tables, setTables] = useState(10);
  const [zone, setZone] = useState('Main room');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('admin_create_venue', {
      p_name: name.trim(),
      p_slug: slug,
      p_tables: tables,
      p_zone: zone,
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.push(`/admin/v/${data as string}`);
  }

  return (
    <main className="admin">
      <header className="admin-head">
        <Logo size={40} />
        <div className="col grow" style={{ gap: 2 }}>
          <span className="wordmark" style={{ fontSize: 16 }}>Serendine</span>
          <span className="small">{isAdmin ? 'Admin' : 'Venue manager'} · {email}</span>
        </div>
        {isAdmin && <Link className="btn btn-ghost btn-sm" href="/admin/reports" style={{ textDecoration: 'none', color: 'var(--text)' }}>Reports</Link>}
      </header>

      <h1 className="display" style={{ fontSize: 30 }}>{isAdmin ? 'Restaurants' : 'Your venues'}</h1>

      <div className="admin-grid">
        {venues.map((v) => (
          <Link key={v.id} href={`/admin/v/${v.id}`} className="card col admin-venue" style={{ gap: 8 }}>
            <strong style={{ fontSize: 18 }}>{v.name}</strong>
            <span className="small">serendine · /{v.slug}</span>
            <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
              <span className="small"><b>{v.tables}</b> tables</span>
              <span className="small"><b>{v.team}</b> team</span>
              <span className="small"><b>{v.guests_now}</b> here now</span>
            </div>
          </Link>
        ))}
        {venues.length === 0 && <p className="small">No restaurants yet. Add the first one below.</p>}
      </div>

      {isAdmin && (
        <form className="card col" style={{ gap: 14, maxWidth: 560 }} onSubmit={create}>
          <strong style={{ fontSize: 18 }}>Add a restaurant</strong>
          <div className="col">
            <label className="label" htmlFor="v-name">Restaurant name</label>
            <input
              id="v-name"
              className="input"
              required
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="col">
            <label className="label" htmlFor="v-slug">Web name</label>
            <input
              id="v-slug"
              className="input"
              required
              pattern="[a-z0-9-]{2,60}"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
            />
            <span className="small">Lower-case letters, numbers and dashes. Used in staff links.</span>
          </div>
          <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
            <div className="col" style={{ width: 140 }}>
              <label className="label" htmlFor="v-tables">Tables</label>
              <input id="v-tables" className="input" type="number" min={1} max={200} value={tables} onChange={(e) => setTables(Number(e.target.value))} />
            </div>
            <div className="col grow">
              <label className="label" htmlFor="v-zone">Area name</label>
              <input id="v-zone" className="input" maxLength={40} value={zone} onChange={(e) => setZone(e.target.value)} />
            </div>
          </div>
          <span className="small">You can rename tables, add areas like &quot;Terrace&quot; and invite the manager on the next screen.</span>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add restaurant'}</button>
        </form>
      )}
    </main>
  );
}
