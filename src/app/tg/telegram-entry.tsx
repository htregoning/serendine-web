'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/logo';
import { createClient } from '@/lib/supabase/client';
import { markTelegram, tableTokenFromText, type TelegramWebApp } from '@/lib/telegram';

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? '';

function loadTelegram(): Promise<TelegramWebApp | null> {
  return new Promise((resolve) => {
    const w = window as unknown as { Telegram?: { WebApp?: TelegramWebApp } };
    if (w.Telegram?.WebApp) return resolve(w.Telegram.WebApp);
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    s.onload = () => resolve(w.Telegram?.WebApp ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

type Stage = 'loading' | 'outside' | 'ready' | 'error';

export default function TelegramEntry({ to }: { to: string | null }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState<string | null>(null);
  const [app, setApp] = useState<TelegramWebApp | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const tg = await loadTelegram();
      if (!live) return;
      if (!tg || !tg.initData) return setStage('outside');
      setApp(tg);
      markTelegram();
      tg.ready();
      tg.expand();
      try {
        tg.setHeaderColor('#0B1A3A');
        tg.setBackgroundColor('#0B1A3A');
      } catch {
        // Older Telegram versions.
      }

      // Ask once whether the bot may message them, for notifications.
      let writeAccess = tg.initDataUnsafe?.user?.allows_write_to_pm === true;
      const askWrite = tg.requestWriteAccess;
      if (!writeAccess && typeof askWrite === 'function') {
        writeAccess = await new Promise<boolean>((resolve) => {
          try {
            askWrite.call(tg, (ok: boolean) => resolve(ok));
          } catch {
            resolve(false);
          }
        });
      }

      const res = await fetch('/api/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData, writeAccess }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; start?: string | null; error?: string };
      if (!live) return;
      if (!res.ok || !out.ok) {
        setError(out.error ?? 'Sign-in failed. Please close and reopen Serendine.');
        return setStage('error');
      }
      if (to) return router.replace(to);
      if (out.start) return router.replace(`/t/${out.start}`);
      // No table code: take a checked-in guest back to their room, otherwise offer the scanner.
      const { data: active } = await createClient().rpc('my_active_table_token');
      if (!live) return;
      if (typeof active === 'string' && active) return router.replace(`/t/${active}/room`);
      setStage('ready');
    })();
    return () => {
      live = false;
    };
  }, [router, to]);

  function scan() {
    const tg = app;
    if (!tg?.showScanQrPopup) return;
    tg.showScanQrPopup({ text: 'Scan the Serendine code on your table' }, (text: string) => {
      const token = tableTokenFromText(text);
      if (!token) return false;
      tg.closeScanQrPopup?.();
      router.push(`/t/${token}`);
      return true;
    });
  }

  return (
    <main className="shell" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <div className="brand-lockup">
        <Logo size={96} />
        <span className="wordmark" style={{ fontSize: 22 }}>Serendine</span>
      </div>
      {stage === 'loading' && <p className="lede">Signing you in with Telegram…</p>}
      {stage === 'error' && <p className="error">{error}</p>}
      {stage === 'outside' && (
        <>
          <p className="lede">This page opens inside Telegram.</p>
          {BOT && (
            <a className="btn btn-primary" href={`https://t.me/${BOT}`} style={{ textDecoration: 'none' }}>
              Open Serendine in Telegram
            </a>
          )}
          <a className="small" href="/">Or use Serendine in your browser</a>
        </>
      )}
      {stage === 'ready' && (
        <>
          <h1 className="display">You&apos;re in.</h1>
          <p className="lede">Scan the code on your table to say hello to the room.</p>
          {app?.showScanQrPopup && (
            <button className="btn btn-primary" onClick={scan}>Scan table code</button>
          )}
          <a className="small" href="/connections">Your connections</a>
        </>
      )}
    </main>
  );
}
