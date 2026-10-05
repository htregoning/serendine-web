'use client';

import { useT } from '@/components/lang';

import { useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { enablePush, pushState, refreshPush, sendTestPush, type PushState } from '@/lib/push';
import { playSound, setSoundOn, soundOn } from '@/lib/alerts';
import { inTelegram } from '@/lib/telegram';

type Props = { supabase: ReturnType<typeof createClient>; who: 'guest' | 'staff'; compact?: boolean };

const TEST_RESULT: Record<string, string> = {
  'not configured': 'The server keys for notifications aren’t set up yet (VAPID keys in Vercel).',
  'database update missing': 'The test needs the latest database update (0010).',
  'no devices': 'This device isn’t registered yet. Turn notifications off and on again in your browser settings, then refresh. In Telegram, close Serendine, reopen it and allow messages from the bot.',
  'push service refused': 'Your phone’s push service turned the message down. Try turning notifications off and on again.',
  offline: 'You seem to be offline.',
  error: 'Something went wrong sending the test.',
};

// Notifications and sound settings, with honest help for iPhone and blocked cases.
export default function NotifyToggle({ supabase, who, compact = false }: Props) {
  const t = useT();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [tg, setTg] = useState(false);

  useEffect(() => {
    setSound(soundOn());
    if (inTelegram()) {
      setTg(true);
      setState('on');
      return;
    }
    pushState().then((s) => {
      setState(s);
      if (s === 'on') refreshPush(supabase);
    });
  }, [supabase]);

  if (state === null) return null;

  function toggleSound() {
    const next = !sound;
    setSound(next);
    setSoundOn(next);
    if (next) playSound(who === 'staff' ? 'staff' : 'message', { force: true });
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await sendTestPush();
    setBusy(false);
    setMsg(
      r.sent > 0
        ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}. Lock your phone or switch apps to see it arrive.`
        : TEST_RESULT[r.reason ?? 'error'] ?? TEST_RESULT.error,
    );
  }

  const soundButton = (
    <button className="btn btn-ghost btn-sm" onClick={toggleSound} aria-pressed={sound}>
      {sound ? t('Sound on') : t('Sound off')}
    </button>
  );

  // Notifications already on (or not possible here): a slim row with sound and a test button.
  if (state === 'on' || state === 'unsupported' || (state === 'not-configured' && who === 'guest')) {
    return (
      <div className="col" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="small grow">
            {tg ? 'Alerts arrive as Telegram messages' : state === 'on' ? t('Notifications on') : t('Alerts play while this screen is open')}
          </span>
          {state === 'on' && (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={test}>
              {busy ? t('Sending…') : t('Send test')}
            </button>
          )}
          {soundButton}
        </div>
        {msg && <span className="small" role="status">{msg}</span>}
      </div>
    );
  }

  // A slim prompt (guest room): one line and a button, instead of the full card.
  if (compact && state === 'off') {
    return (
      <div className="row notify-slim" style={{ gap: 8, alignItems: 'center' }}>
        <span className="small grow">{t('Get alerts for messages and drinks, even with your phone locked.')}</span>
        <button
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const s = await enablePush(supabase);
            setState(s);
            setBusy(false);
            if (s === 'on') test();
          }}
        >
          {busy ? t('Turning on…') : t('Turn on')}
        </button>
      </div>
    );
  }

  const what =
    who === 'guest'
      ? t('Get a notification when someone messages you, sends you a drink, or staff are on their way, even with your phone locked.')
      : 'Get a notification for every new table request and drink order, even when this screen is in the background.';

  return (
    <div className="card col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <strong className="grow">{t('Turn on notifications')}</strong>
        {soundButton}
      </div>
      {state === 'off' && (
        <>
          <span className="small">{what}</span>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const s = await enablePush(supabase);
              setState(s);
              setBusy(false);
              if (s === 'on') test();
            }}
          >
            {busy ? t('Turning on…') : t('Turn on notifications')}
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
      {state === 'not-configured' && (
        <span className="small">
          Phone notifications aren&apos;t switched on for Serendine yet: the notification keys need adding in Vercel (see
          /staff/push-keys). Sounds still play while this screen is open.
        </span>
      )}
      {msg && <span className="small" role="status">{msg}</span>}
    </div>
  );
}
