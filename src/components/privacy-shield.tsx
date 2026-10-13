'use client';

import { useEffect } from 'react';

// Hides the screen when you switch apps, lock the phone or pull down notifications, so a private
// conversation never shows in the app switcher or over your shoulder. On unless the guest turns it off.
const KEY = 'serendine-hide-on-switch';

export function hideOnSwitch() {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setHideOnSwitch(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private mode */
  }
}

export default function PrivacyShield() {
  useEffect(() => {
    const root = document.documentElement;
    const hide = () => {
      if (hideOnSwitch()) root.classList.add('privacy-hide');
    };
    const show = () => {
      if (document.visibilityState === 'visible') root.classList.remove('privacy-hide');
    };
    const onVis = () => (document.visibilityState === 'hidden' ? hide() : show());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('focus', show);
    window.addEventListener('pageshow', show);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('blur', hide);
      window.removeEventListener('focus', show);
      window.removeEventListener('pageshow', show);
      root.classList.remove('privacy-hide');
    };
  }, []);
  return null;
}
