'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Feedback = {
  visit_id: string;
  created_at: string;
  rating: number;
  comment: string | null;
  name: string | null;
  alias: string;
  table_label: string;
  handled: boolean;
};

// Guests' ratings and private comments, low ones first to act on.
export default function FeedbackList({ venueId, days }: { venueId: string; days: number }) {
  const [supabase] = useState(() => createClient());
  const [list, setList] = useState<Feedback[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('venue_feedback', { v: venueId, p_days: days });
    setList((data as Feedback[] | null) ?? []);
  }, [supabase, venueId, days]);

  useEffect(() => {
    load();
  }, [load]);

  async function handled(id: string) {
    await supabase.rpc('mark_feedback_handled', { p_visit: id });
    load();
  }

  if (!list) return null;
  const open = list.filter((f) => f.rating <= 3 && !f.handled);
  const shown = showAll ? list : list.filter((f) => f.comment || (f.rating <= 3 && !f.handled)).slice(0, 8);

  return (
    <section className="card col" style={{ gap: 10 }} aria-label="Guest ratings">
      <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong className="grow">What guests said</strong>
        {open.length > 0 && <span className="pill">{open.length} to follow up</span>}
      </div>
      {list.length === 0 && <span className="small">No ratings yet. Guests are asked when they leave.</span>}
      {shown.map((f) => (
        <div key={f.visit_id} className="visit-row">
          <span>
            <b className={f.rating <= 3 ? 'rating-low' : 'rating-good'}>{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</b>
            {' · '}
            {f.name || f.alias} · Table {f.table_label} · {new Date(f.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </span>
          {f.comment && <span className="small" style={{ color: 'var(--text)' }}>&ldquo;{f.comment}&rdquo;</span>}
          {f.rating <= 3 && !f.handled && (
            <button className="link-quiet small" onClick={() => handled(f.visit_id)}>Mark as followed up</button>
          )}
        </div>
      ))}
      {list.length > shown.length && (
        <button className="link-quiet small" onClick={() => setShowAll(true)}>Show all {list.length} ratings</button>
      )}
    </section>
  );
}
