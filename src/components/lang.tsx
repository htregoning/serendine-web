'use client';

import { createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { LANG_COOKIE, translate, type Lang } from '@/lib/i18n';

const LangContext = createContext<Lang>('en');

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

// const t = useT(); t('Leave'); t('Visible as {name}', { name })
export function useT() {
  const lang = useContext(LangContext);
  return (text: string, vars?: Record<string, string | number>) => translate(lang, text, vars);
}

// "العربية" / "English" switch for guest screens. Remembered for a year on this device.
export function LangToggle() {
  const lang = useContext(LangContext);
  const router = useRouter();
  const next: Lang = lang === 'ar' ? 'en' : 'ar';
  return (
    <button
      className="lang-toggle"
      lang={next}
      onClick={() => {
        document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = next;
        document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
        router.refresh();
      }}
    >
      {next === 'ar' ? 'العربية' : 'English'}
    </button>
  );
}
