'use client';

import { useEffect, useState } from 'react';
import { toString as qrSvg } from 'qrcode';
import Logo from '@/components/logo';

export type StickerTable = { label: string; zone: string; qr_token: string };

type Props = { venueName: string; accent: string; tables: StickerTable[] };

export default function StickerSheet({ venueName, accent, tables }: Props) {
  const [base, setBase] = useState('');
  const [codes, setCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    setBase(window.location.origin);
  }, []);

  useEffect(() => {
    if (!base) return;
    let live = true;
    Promise.all(
      tables.map(async (t) => {
        const svg = await qrSvg(`${base}/t/${t.qr_token}`, {
          type: 'svg',
          margin: 0,
          errorCorrectionLevel: 'M',
          color: { dark: '#0B1A3A', light: '#FFFFFF' },
        });
        return [t.qr_token, svg] as const;
      }),
    ).then((pairs) => {
      if (live) setCodes(Object.fromEntries(pairs));
    });
    return () => {
      live = false;
    };
  }, [base, tables]);

  return (
    <div className="stickers-page">
      <header className="no-print stickers-head">
        <div className="col" style={{ gap: 4 }}>
          <strong style={{ fontSize: 20 }}>Table stickers · {venueName}</strong>
          <span className="small">
            {tables.length} tables. Prints four stickers per A4 page at 90 × 120 mm. Each code opens that table&apos;s check-in.
          </span>
          <span className="small">Codes point to {base || '…'}. Reprint after connecting your own domain.</span>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>Print stickers</button>
      </header>

      <div className="sheet">
        {tables.map((t) => (
          <article key={t.qr_token} className="sticker">
            <div className="sticker-top">
              <Logo size={34} color="#FF2E93" />
              <span className="sticker-brand">Serendine</span>
              <span className="sticker-table">TABLE {t.label}</span>
            </div>
            <div className="sticker-qr" dangerouslySetInnerHTML={{ __html: codes[t.qr_token] ?? '' }} />
            <p className="sticker-line">Scan to say hello to another table</p>
            <p className="sticker-sub">Call a waiter, ask for the bill, see the menu. Stay anonymous until you both agree.</p>
            <p className="sticker-foot">{venueName} · 18+</p>
          </article>
        ))}
      </div>
    </div>
  );
}
