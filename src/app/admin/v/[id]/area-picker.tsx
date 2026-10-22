'use client';

import { useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';

type Client = ReturnType<typeof createClient>;

// Which neighbourhood a venue is in, so it's featured in that neighbourhood's "chat nearby" room.
export default function AreaPicker({ supabase, venueId }: { supabase: Client; venueId: string }) {
  const [areas, setAreas] = useState<{ slug: string; name: string }[] | null>(null);
  const [area, setArea] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [a, v] = await Promise.all([
        supabase.from('areas').select('slug, name').order('name'),
        supabase.from('venues').select('area').eq('id', venueId).maybeSingle(),
      ]);
      if (a.error || v.error) return setAreas(null);
      setAreas((a.data as { slug: string; name: string }[]) ?? []);
      setArea(((v.data as { area: string | null } | null)?.area) ?? '');
    })();
  }, [supabase, venueId]);

  async function save(next: string) {
    setArea(next);
    setMsg(null);
    const { error } = await supabase.rpc('admin_set_venue_area', { v: venueId, p_area: next || null });
    setMsg(error ? error.message : next ? 'Saved. This venue now appears in that neighbourhood’s room.' : 'Saved.');
  }

  if (!areas) return null; // before update 0035
  return (
    <section className="card col" style={{ gap: 8, maxWidth: 560 }} aria-label="Neighbourhood">
      <strong>Neighbourhood</strong>
      <span className="small">Featured in this neighbourhood&apos;s &quot;Chat nearby&quot; room, and the rooms next to it.</span>
      <select className="input" value={area} onChange={(e) => save(e.target.value)} aria-label="Neighbourhood">
        <option value="">Not set</option>
        {areas.map((a) => (
          <option key={a.slug} value={a.slug}>{a.name}</option>
        ))}
      </select>
      {msg && <span className="small" role="status">{msg}</span>}
    </section>
  );
}
