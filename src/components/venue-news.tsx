'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { playSound } from '@/lib/alerts';

type Client = ReturnType<typeof createClient>;

export type AnnouncementKind = 'last_orders' | 'happy_hour' | 'running_low' | 'special' | 'general';
type Announcement = { id: string; kind: AnnouncementKind; body: string; created_at: string; expires_at: string };

export const KIND_LABELS: Record<AnnouncementKind, string> = {
  last_orders: 'Last orders',
  happy_hour: 'Happy hour',
  running_low: 'Running low',
  special: 'Special',
  general: 'From the venue',
};

const KIND_MARK: Record<AnnouncementKind, string> = {
  last_orders: '🔔',
  happy_hour: '🍹',
  running_low: '⏳',
  special: '✨',
  general: '📣',
};

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? 'just now' : m === 1 ? '1 min ago' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
};

// Messages from the venue to everyone checked in: last orders, specials and so on.
export default function VenueNews({ supabase, venueId, visitId, venueName }: { supabase: Client; venueId: string; visitId: string; venueName: string }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [muted, setMuted] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  const mutedRef = useRef(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('venue_announcements')
      .select('id, kind, body, created_at, expires_at')
      .eq('venue_id', venueId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) return; // Before the database update: nothing to show.
    const list = (data as Announcement[] | null) ?? [];
    if (seen.current && !mutedRef.current && list.some((a) => !seen.current!.has(a.id))) playSound('update');
    seen.current = new Set(list.map((a) => a.id));
    setItems(list);
  }, [supabase, venueId]);

  useEffect(() => {
    supabase
      .from('visits')
      .select('mute_venue')
      .eq('id', visitId)
      .maybeSingle()
      .then(({ data }: { data: { mute_venue?: boolean } | null }) => {
        mutedRef.current = !!data?.mute_venue;
        setMuted(!!data?.mute_venue);
      });
  }, [supabase, visitId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`news-${venueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_announcements', filter: `venue_id=eq.${venueId}` }, () => load())
      .subscribe();
    const t = setInterval(load, 30000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
  }, [supabase, venueId, load]);

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    await supabase.rpc('set_venue_mute', { p_mute: next });
  }

  const shown = items.filter((a) => !hidden.has(a.id));
  if (shown.length === 0) return null;

  return (
    <section className="col" style={{ gap: 8 }} aria-label={`Messages from ${venueName}`}>
      {shown.map((a) => (
        <div key={a.id} className={`card venue-news venue-news-${a.kind}`} role="status">
          <span className="venue-news-mark" aria-hidden="true">{KIND_MARK[a.kind] ?? '📣'}</span>
          <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
            <span className="eyebrow">{KIND_LABELS[a.kind] ?? 'From the venue'} · {ago(a.created_at)}</span>
            <strong className="venue-news-body">{a.body}</strong>
          </div>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setHidden((h) => new Set(h).add(a.id))}>×</button>
        </div>
      ))}
      <button className="link-quiet small" onClick={toggleMute}>
        {muted ? `Turn ${venueName}'s notifications back on` : `Mute notifications from ${venueName}`}
      </button>
    </section>
  );
}
