'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/components/lang';

// "7 people here tonight · 3 open to chat". Refreshes every 30 seconds.
export default function Buzz({ token, compact = false }: { token: string; compact?: boolean }) {
  const [supabase] = useState(() => createClient());
  const [n, setN] = useState<{ here: number; open_now: number } | null>(null);
  const t = useT();

  useEffect(() => {
    let live = true;
    const load = () =>
      supabase.rpc('room_buzz', { token }).then(({ data, error }: { data: { here: number; open_now: number }[] | null; error: unknown }) => {
        if (live && !error) setN(data?.[0] ?? null);
      });
    load();
    const id = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [supabase, token]);

  if (!n || n.here < 2) return null;
  const text =
    n.open_now > 0
      ? t('{here} people here tonight · {open} open to chat', { here: n.here, open: n.open_now })
      : t('{here} people here tonight', { here: n.here });
  return (
    <div className={compact ? 'buzz buzz-compact' : 'buzz'} role="status">
      <span className="buzz-dot" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
