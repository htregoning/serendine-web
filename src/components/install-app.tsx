'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/lang';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type W = Window & { __serendineInstall?: InstallEvent | null };

// Catches the browser's "this can be installed" moment as early as possible (placed in the root layout),
// so the Install button works even if the page that shows it opens later.
export function InstallCapture() {
  useEffect(() => {
    const w = window as W;
    const keep = (e: Event) => {
      e.preventDefault();
      w.__serendineInstall = e as InstallEvent;
      window.dispatchEvent(new Event('serendine-installable'));
    };
    const done = () => {
      w.__serendineInstall = null;
      window.dispatchEvent(new Event('serendine-installable'));
    };
    window.addEventListener('beforeinstallprompt', keep);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', keep);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  return null;
}

function standalone() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

// "Put Serendine on your home screen", with a one-tap install where the browser allows it,
// and simple steps on iPhone (Share › Add to Home Screen). Hidden once it's installed.
export default function InstallApp({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [ios, setIos] = useState(false);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    const w = window as W;
    const update = () => setCanPrompt(!!w.__serendineInstall);
    setInstalled(standalone());
    setIos(isIos());
    update();
    setReady(true);
    window.addEventListener('serendine-installable', update);
    return () => window.removeEventListener('serendine-installable', update);
  }, []);

  if (!ready || installed) return null;

  async function install() {
    const w = window as W;
    const e = w.__serendineInstall;
    if (!e) return setSteps(true);
    await e.prompt();
    const choice = await e.userChoice.catch(() => null);
    w.__serendineInstall = null;
    setCanPrompt(false);
    if (choice?.outcome === 'accepted') setInstalled(true);
  }

  return (
    <section className={compact ? 'install-app compact' : 'install-app'} aria-label={t('Put Serendine on your home screen')}>
      <div className="col" style={{ gap: 4 }}>
        <strong style={{ fontSize: compact ? 16 : 19 }}>{t('Put Serendine on your home screen')}</strong>
        <span className="small">
          {t('Opens like an app: your table, chats, places and plans in one tap.')}
          {ios ? ` ${t('On iPhone it also lets Serendine send you notifications.')}` : ''}
        </span>
      </div>
      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => (canPrompt ? install() : setSteps((s) => !s))}>
        {t('Install app')}
      </button>
      {steps && !canPrompt && (
        <ol className="install-steps small">
          {ios ? (
            <>
              <li>{t('Tap the Share button')} <span aria-hidden="true">(⬆︎)</span> {t('at the bottom of Safari, or at the top on iPad.')}</li>
              <li>{t('Scroll down and tap “Add to Home Screen”.')}</li>
              <li>{t('Tap “Add”. Serendine appears with your other apps.')}</li>
            </>
          ) : (
            <>
              <li>{t('Open your browser’s menu (⋮ or ⋯).')}</li>
              <li>{t('Tap “Install app” or “Add to Home screen”.')}</li>
              <li>{t('Confirm, and Serendine appears with your other apps.')}</li>
            </>
          )}
        </ol>
      )}
    </section>
  );
}
