'use client';

import { useEffect, useMemo, useState } from 'react';
import { toString as qrSvg } from 'qrcode';
import Logo from '@/components/logo';
import { createClient } from '@/lib/supabase/client';

export type StickerTable = { label: string; zone: string; qr_token: string };

export type StickerDesign = {
  bg: string;
  fg: string;
  accent: string;
  headline: string;
  sub: string;
  logo: string | null;
};

export const DEFAULT_DESIGN: StickerDesign = {
  bg: '#F7F6FF',
  fg: '#0B1A3A',
  accent: '#FF2E93',
  headline: 'Scan to say hello to another table',
  sub: 'Call a waiter, ask for the bill, see the menu. Stay anonymous until you both agree.',
  logo: null,
};

const PRESETS: { name: string; bg: string; fg: string; accent: string }[] = [
  { name: 'Serendine', bg: '#F7F6FF', fg: '#0B1A3A', accent: '#FF2E93' },
  { name: 'Midnight', bg: '#0B1A3A', fg: '#FFFFFF', accent: '#FF2E93' },
  { name: 'Ivory & gold', bg: '#FBF6EC', fg: '#2B2118', accent: '#B8892D' },
  { name: 'Forest', bg: '#14342B', fg: '#F3EFE4', accent: '#E3B866' },
  { name: 'Terracotta', bg: '#F4E6DA', fg: '#3A1F14', accent: '#C4552D' },
  { name: 'Mono', bg: '#FFFFFF', fg: '#111111', accent: '#111111' },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;
const MAX_LOGO = 300000;

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  if (!HEX.test(a) || !HEX.test(b)) return 21;
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Shrinks an uploaded logo to a small image that's quick to load and store.
async function shrinkLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That image could not be opened.'));
      i.src = url;
    });
    const w0 = img.naturalWidth || 600;
    const h0 = img.naturalHeight || 240;
    for (const maxW of [720, 520, 360]) {
      const scale = Math.min(1, maxW / w0, (maxW * 0.5) / h0);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w0 * scale));
      canvas.height = Math.max(1, Math.round(h0 * scale));
      const g = canvas.getContext('2d');
      if (!g) break;
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const [type, q] of [['image/png', undefined], ['image/webp', 0.9], ['image/jpeg', 0.88]] as const) {
        const data = canvas.toDataURL(type, q);
        if (data.startsWith(`data:${type}`) && data.length <= MAX_LOGO) return data;
      }
    }
    throw new Error('That logo is too detailed. Try a simpler or smaller image.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Props = {
  venueId: string;
  venueName: string;
  tables: StickerTable[];
  initial: StickerDesign;
  canSave: boolean;
};

export default function StickerSheet({ venueId, venueName, tables, initial, canSave }: Props) {
  const [supabase] = useState(() => createClient());
  const [base, setBase] = useState('');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [d, setD] = useState<StickerDesign>(initial);
  const [saved, setSaved] = useState<StickerDesign>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);

  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const valid = HEX.test(d.bg) && HEX.test(d.fg) && HEX.test(d.accent);

  // The code itself must stay dark on white so every phone camera can read it.
  const qrDark = useMemo(() => (HEX.test(d.fg) && contrast(d.fg, '#FFFFFF') >= 7 ? d.fg : '#0B1A3A'), [d.fg]);
  const readable = contrast(d.fg, d.bg);

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
          color: { dark: qrDark, light: '#FFFFFF' },
        });
        return [t.qr_token, svg] as const;
      }),
    ).then((pairs) => {
      if (live) setCodes(Object.fromEntries(pairs));
    });
    return () => {
      live = false;
    };
  }, [base, tables, qrDark]);

  function set<K extends keyof StickerDesign>(k: K, v: StickerDesign[K]) {
    setD((x) => ({ ...x, [k]: v }));
    setMsg(null);
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    try {
      set('logo', await shrinkLogo(file));
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function save() {
    if (!valid) {
      setMsg('Colours need to look like #12AB34.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('admin_update_sticker', {
      v: venueId,
      p_bg: d.bg,
      p_fg: d.fg,
      p_accent: d.accent,
      p_headline: d.headline.trim() || DEFAULT_DESIGN.headline,
      p_sub: d.sub,
      p_logo: d.logo ?? '',
    });
    setBusy(false);
    if (error) {
      setMsg(
        error.code === 'PGRST202'
          ? 'Saving needs the latest database update (0010). Your design still prints from this page.'
          : `Could not save: ${error.message}`,
      );
      return;
    }
    const clean = { ...d, headline: d.headline.trim() || DEFAULT_DESIGN.headline };
    setD(clean);
    setSaved(clean);
    setMsg('Design saved. It will be used every time you print.');
  }

  const vars = {
    '--st-bg': HEX.test(d.bg) ? d.bg : DEFAULT_DESIGN.bg,
    '--st-fg': HEX.test(d.fg) ? d.fg : DEFAULT_DESIGN.fg,
    '--st-accent': HEX.test(d.accent) ? d.accent : DEFAULT_DESIGN.accent,
  } as React.CSSProperties;

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
        <div className="row" style={{ gap: 8 }}>
          <button className="st-btn" onClick={() => setEditing((e) => !e)}>{editing ? 'Hide design' : 'Edit design'}</button>
          <button className="st-btn st-btn-primary" onClick={() => window.print()}>Print stickers</button>
        </div>
      </header>

      {editing && (
        <section className="no-print st-editor" aria-label="Sticker design">
          <div className="st-field">
            <span className="st-label">Your logo</span>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <label className="st-btn">
                {d.logo ? 'Change logo' : 'Upload logo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  hidden
                  onChange={(e) => {
                    onLogo(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {d.logo && <button className="st-btn" onClick={() => set('logo', null)}>Remove logo</button>}
            </div>
            <span className="st-hint">A PNG with a see-through background looks best. It replaces the Serendine name at the top.</span>
          </div>

          <div className="st-field">
            <span className="st-label">Colour presets</span>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  className="st-preset"
                  onClick={() => setD((x) => ({ ...x, bg: p.bg, fg: p.fg, accent: p.accent }))}
                  title={p.name}
                >
                  <span style={{ background: p.bg }} />
                  <span style={{ background: p.fg }} />
                  <span style={{ background: p.accent }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="st-colours">
            {(
              [
                ['bg', 'Background'],
                ['fg', 'Text'],
                ['accent', 'Highlight'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="st-colour">
                <span className="st-label">{label}</span>
                <span className="row" style={{ gap: 6 }}>
                  <input
                    type="color"
                    value={HEX.test(d[k]) ? d[k] : '#000000'}
                    onChange={(e) => set(k, e.target.value.toUpperCase())}
                  />
                  <input
                    className="st-input st-hex"
                    value={d[k]}
                    maxLength={7}
                    onChange={(e) => set(k, e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)}
                  />
                </span>
              </label>
            ))}
          </div>
          {readable < 3 && (
            <p className="st-warn">The text colour is hard to read on this background. Pick a lighter or darker one.</p>
          )}
          {qrDark !== d.fg && HEX.test(d.fg) && (
            <p className="st-hint">The QR code stays dark navy on white so every phone camera can read it.</p>
          )}

          <label className="st-field">
            <span className="st-label">Headline ({d.headline.length}/60)</span>
            <input className="st-input" maxLength={60} value={d.headline} onChange={(e) => set('headline', e.target.value)} />
          </label>
          <label className="st-field">
            <span className="st-label">Small print ({d.sub.length}/140)</span>
            <textarea className="st-input" rows={2} maxLength={140} value={d.sub} onChange={(e) => set('sub', e.target.value)} />
          </label>

          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {canSave && (
              <button className="st-btn st-btn-primary" disabled={busy || !dirty} onClick={save}>
                {busy ? 'Saving…' : dirty ? 'Save design' : 'Saved'}
              </button>
            )}
            <button className="st-btn" onClick={() => setD({ ...DEFAULT_DESIGN })}>Reset to Serendine style</button>
            {dirty && <button className="st-btn" onClick={() => setD(saved)}>Undo changes</button>}
          </div>
          {!canSave && (
            <p className="st-hint">Saving designs needs the latest database update (0010). You can still print this design now.</p>
          )}
          {msg && <p className="st-hint" role="status">{msg}</p>}
        </section>
      )}

      <div className="sheet" style={vars}>
        {tables.map((t) => (
          <article key={t.qr_token} className="sticker">
            <div className="sticker-top">
              {d.logo ? (
                <img className="sticker-logo" src={d.logo} alt={venueName} />
              ) : (
                <>
                  <Logo size={34} color={HEX.test(d.accent) ? d.accent : DEFAULT_DESIGN.accent} />
                  <span className="sticker-brand">Serendine</span>
                </>
              )}
              <span className="sticker-table">TABLE {t.label}</span>
            </div>
            <div className="sticker-qr" dangerouslySetInnerHTML={{ __html: codes[t.qr_token] ?? '' }} />
            <p className="sticker-line">{d.headline || DEFAULT_DESIGN.headline}</p>
            {d.sub.trim() && <p className="sticker-sub">{d.sub}</p>}
            <p className="sticker-foot">
              <span>{venueName} · 18+</span>
              <span className="sticker-powered">Powered by Serendine</span>
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
