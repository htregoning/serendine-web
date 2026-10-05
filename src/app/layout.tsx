import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { IBM_Plex_Sans_Arabic, Jost, Manrope, Playfair_Display } from 'next/font/google';
import { LangProvider } from '@/components/lang';
import { LANG_COOKIE, isLang, type Lang } from '@/lib/i18n';
import './globals.css';

const display = Jost({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-display' });
const body = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body' });
// Serif headings for venues that choose the Classic type style (only downloaded when used).
const serif = Playfair_Display({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-serif', preload: false });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600', '700'], variable: '--font-arabic' });

export const metadata: Metadata = {
  title: 'Serendine',
  description: 'Say hello to another table.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B1A3A',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(saved) ? saved : 'en';
  return (
    <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} className={`${display.variable} ${body.variable} ${serif.variable} ${arabic.variable}`}>
      <body>
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
