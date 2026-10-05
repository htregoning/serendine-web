'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import MediaView from '@/components/media-view';
import { playSound } from '@/lib/alerts';
import type { MediaKind } from '@/lib/media';

type Client = ReturnType<typeof createClient>;
type Pending = { id: number; media_path: string; media_kind: MediaKind; caption: string; alias: string; table_label: string; created_at: string };

// Photos and videos guests want to post to the group chat. Nothing shows to the room until approved.
export default function PhotoReview({ supabase, venueId }: { supabase: Client; venueId: string }) {
  const [items, setItems] = useState<Pending[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const seen = useRef<Set<number> | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('pending_lobby_media', { v: venueId });
    if (error) return setItems(null); // before database update 0020
    const list = (data as Pending[] | null) ?? [];
    if (seen.current && list.some((p) => !seen.current!.has(p.id))) playSound('staff');
    seen.current = new Set(list.map((p) => p.id));
    setItems(list);
  }, [supabase, venueId]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 15000);
    return () => clearInterval(poll);
  }, [load]);

  async function review(id: number, approve: boolean) {
    setBusy(id);
    await supabase.rpc('review_lobby_media', { p_id: id, p_approve: approve });
    setBusy(null);
    load();
  }

  if (!items || items.length === 0) return null;
  return (
    <section className="card col" style={{ gap: 12, borderColor: 'var(--accent)', borderWidth: 2 }} aria-label="Photos to approve">
      <strong>Photos for the group chat · {items.length} to check</strong>
      <span className="small">Approve anything friendly and suitable for everyone in the room. Declined photos are deleted and the guest isn&apos;t told why.</span>
      <div className="review-grid">
        {items.map((p) => (
          <div key={p.id} className="col review-item">
            <MediaView supabase={supabase} src={{ bucket: 'group-media', path: p.media_path, kind: p.media_kind }} />
            <span className="small">
              Table {p.table_label} · {p.alias}
              {p.caption ? ` · "${p.caption}"` : ''}
            </span>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost btn-sm grow" disabled={busy === p.id} onClick={() => review(p.id, false)}>Decline</button>
              <button className="btn btn-primary btn-sm grow" disabled={busy === p.id} onClick={() => review(p.id, true)}>Approve</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
