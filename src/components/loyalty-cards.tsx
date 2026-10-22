'use client';

import { useCallback, useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { useT } from '@/components/lang';
import type { MyCard } from '@/lib/loyalty';

type Client = ReturnType<typeof createClient>;

// A guest's loyalty cards: at one venue (in the room) or everywhere (their own page).
export default function LoyaltyCards({ supabase, venueId = null, showVenue = false, live = false }: { supabase: Client; venueId?: string | null; showVenue?: boolean; live?: boolean }) {
  const t = useT();
  const [cards, setCards] = useState<MyCard[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_loyalty', { v: venueId });
    if (!error) setCards((data as MyCard[] | null) ?? []);
  }, [supabase, venueId]);

  useEffect(() => {
    load();
    if (!live) return;
    const poll = setInterval(load, 20000); // staff add stamps from their screen
    return () => clearInterval(poll);
  }, [load, live]);

  if (cards.length === 0) return null;
  return (
    <section className="col" style={{ gap: 8 }} aria-label={t('Your rewards')}>
      {showVenue && <span className="eyebrow">{t('Your rewards')}</span>}
      {cards.map((c) => (
        <div key={c.scheme_id} className={c.ready > 0 ? 'loyalty-card ready' : 'loyalty-card'}>
          <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
            <strong className="grow">{showVenue ? `${c.venue_name} · ${c.scheme}` : c.scheme}</strong>
            <span className="small">{c.progress}/{c.target}</span>
          </div>
          <div className="loyalty-dots" aria-hidden="true">
            {Array.from({ length: c.target }, (_, i) => (
              <span key={i} className={i < c.progress ? 'on' : ''} />
            ))}
          </div>
          {c.ready > 0 ? (
            <span className="small" style={{ fontWeight: 700, color: 'var(--accent)' }}>
              {t('Reward ready: {reward}. Show this to your server.', { reward: c.reward })}
              {c.ready > 1 ? ` (×${c.ready})` : ''}
            </span>
          ) : (
            <span className="small">
              {c.kind === 'visits'
                ? t('{n} more visits to: {reward}', { n: c.target - c.progress, reward: c.reward })
                : t('{n} more {item} to: {reward}', { n: c.target - c.progress, item: c.item ?? '', reward: c.reward })}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
