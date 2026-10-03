'use client';

import { useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { enablePush, pushState, refreshPush, type PushState } from '@/lib/push';

type Props = { supabase: ReturnType<typeof createClient>; who: 'guest' | 'staff' };

// A small card offering notifications, with honest help for iPhone and blocked cases.
export default function NotifyToggle({ supabase, who }: Props) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState().then((s) => {
      setState(s);
      if (s === 'on') refreshPush(supabase);
    });
  }, [supabase]);

  if (state === null || state === 'on' || state === 'not-configured' || state === 'unsupported') return null;

  const what =
    who === 'guest'
      ? 'Get a notification when someone messages you or staff are on their way, even with your phone locked.'
      : 'Get a notification for every new table request, even when this screen is in the background.';

  return (
    <div className="card col" style={{ gap: 10 }}>
      <strong>Turn on notifications</strong>
      {state === 'off' && (
        <>
          <span className="small">{what}</span>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setState(await enablePush(supabase));
              setBusy(false);
            }}
          >
            {busy ? 'Turning on…' : 'Turn on notifications'}
          </button>
        </>
      )}
      {state === 'needs-home-screen' && (
        <span className="small">
          On iPhone, notifications need Serendine on your home screen: tap the Share button, choose &quot;Add to Home
          Screen&quot;, then open Serendine from there and turn notifications on.
        </span>
      )}
      {state === 'blocked' && (
        <span className="small">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then refresh.
        </span>
      )}
    </div>
  );
}
