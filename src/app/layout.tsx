import type { Metadata, Viewport } from 'next';
import { Jost, Manrope } from 'next/font/google';
import './globals.css';

const display = Jost({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-display' });
const body = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Serendine',
  description: 'Say hello to another table.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B1A3A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
