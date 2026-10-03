'use client';

import { useEffect, useState } from 'react';
import { toString as qrSvg } from 'qrcode';

export type StickerTable = { label: string; zone: string; qr_token: string };

type Props = { venueName: string; accent: string; tables: StickerTable[] };

function Logo({ accent }: { accent: string }) {
  return (
    <svg width="30" height="30" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill={accent} />
      <circle cx="13" cy="25" r="5.5" fill="#17130F" />
      <circle cx="27" cy="15" r="5.5" fill="#17130F" />
      <path d="M16.5 20.5 L23.5 19.5" stroke="#17130F" strokeWidth="2" strokeLinecap="round" strokeDasharray="1.5 3" />
    </svg>
  );
}

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
          color: { dark: '#17130F', light: '#FFFFFF' },
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
              <Logo accent={accent} />
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
