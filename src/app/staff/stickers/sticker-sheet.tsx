'use client';

import { useEffect, useMemo, useState } from 'react';
import { toString as qrSvg } from 'qrcode';
import Logo from '@/components/logo';
import { createClient } from '@/lib/supabase/client';
import { TELEGRAM_BOT, telegramLink } from '@/lib/telegram';

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
  sub: 'Sign in to see any offers tonight. Call a waiter, ask for the bill, see the menu. Stay anonymous until you both agree.',
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
  venueSlug: string;
  tables: StickerTable[];
  initial: StickerDesign;
  canSave: boolean;
  isEvent?: boolean;
};

function fileSafe(s: string) {
  return s.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'code';
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A print-quality code on its own, for designers to place in a programme, poster or menu.
async function downloadCode(url: string, name: string, format: 'svg' | 'png', dark: string) {
  const svg = await qrSvg(url, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'Q',
    width: format === 'png' ? 2000 : undefined,
    color: { dark, light: '#FFFFFF' },
  });
  if (format === 'svg') return saveBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
  const img = new Image();
  const src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not draw the code'));
    img.src = src;
  });
  const size = 2000;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, size, size);
  g.drawImage(img, 0, 0, size, size);
  URL.revokeObjectURL(src);
  canvas.toBlob((b) => b && saveBlob(b, `${name}.png`), 'image/png');
}

export default function StickerSheet({ venueId, venueName, venueSlug, tables, initial, canSave, isEvent = false }: Props) {
  const [supabase] = useState(() => createClient());
  const [base, setBase] = useState('');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [d, setD] = useState<StickerDesign>(initial);
  const [saved, setSaved] = useState<StickerDesign>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);
  const [showCodes, setShowCodes] = useState(isEvent);
  const [target, setTarget] = useState<'web' | 'telegram'>('web');
  // 'large': 4 per A4 page, cut out (90 × 120 mm). 'labels8': 8 per A4 on Avery L7165-size label sheets (99.1 × 67.7 mm).
  const [layout, setLayout] = useState<'large' | 'labels8'>('large');
  const codeUrl = (token: string) => (target === 'telegram' ? telegramLink(token) : `${base}/t/${token}`);
  const codeName = (label: string) =>
    `${fileSafe(venueSlug)}-${fileSafe(label)}${target === 'telegram' ? '-telegram' : ''}`;
  const where = (label: string) => (isEvent ? label.toUpperCase() : `TABLE ${label}`);

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
          <strong style={{ fontSize: 20 }}>{isEvent ? 'QR codes' : 'Table stickers'} · {venueName}</strong>
          <span className="small">
            {tables.length} {isEvent ? 'areas' : 'tables'}.{' '}
            {layout === 'large'
              ? 'Prints four stickers per A4 page at 90 × 120 mm, to cut out.'
              : 'Prints eight per A4 sheet of labels, 99.1 × 67.7 mm (Avery L7165 or any "8 per sheet, 99.1 × 67.7" labels).'}{' '}
            Each code opens that {isEvent ? 'area' : 'table'}&apos;s check-in.
          </span>
          <span className="small">Codes point to {base || '…'}. Reprint after connecting your own domain.</span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className={`st-btn${layout === 'large' ? ' st-btn-primary' : ''}`} onClick={() => setLayout('large')} aria-pressed={layout === 'large'}>
            4 per page
          </button>
          <button className={`st-btn${layout === 'labels8' ? ' st-btn-primary' : ''}`} onClick={() => setLayout('labels8')} aria-pressed={layout === 'labels8'}>
            8 per page (labels)
          </button>
          <button className="st-btn" onClick={() => setShowCodes((s) => !s)}>{showCodes ? 'Hide downloads' : 'Download codes'}</button>
          <button className="st-btn" onClick={() => setEditing((e) => !e)}>{editing ? 'Hide design' : 'Edit design'}</button>
          <button className="st-btn st-btn-primary" onClick={() => window.print()}>Print stickers</button>
        </div>
      </header>

      {showCodes && (
        <section className="no-print st-editor" aria-label="Download codes">
          <strong>Codes for programmes, posters and menus</strong>
          <span className="st-hint">
            Each file is just the QR code, ready for a designer to place. Use <b>SVG</b> for print (sharp at any size) or{' '}
            <b>PNG</b> (2000 × 2000 px) for anything else. Print it at least 2.5 cm wide, on a white background.
          </span>
          {TELEGRAM_BOT && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="st-label">Codes open in</span>
              <button className={`st-btn${target === 'web' ? ' st-btn-primary' : ''}`} onClick={() => setTarget('web')}>
                Any phone browser
              </button>
              <button className={`st-btn${target === 'telegram' ? ' st-btn-primary' : ''}`} onClick={() => setTarget('telegram')}>
                Telegram
              </button>
            </div>
          )}
          <div className="st-codes">
            {tables.map((t) => (
              <div key={t.qr_token} className="st-code-row">
                <span className="grow" style={{ fontWeight: 600 }}>{isEvent ? t.label : `Table ${t.label}`}</span>
                <button className="st-btn" onClick={() => downloadCode(codeUrl(t.qr_token), codeName(t.label), 'svg', qrDark)}>
                  SVG
                </button>
                <button className="st-btn" onClick={() => downloadCode(codeUrl(t.qr_token), codeName(t.label), 'png', qrDark)}>
                  PNG
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

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

      {layout === 'large' ? (
      <div className="sticker-grid" style={vars}>
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
                <span className="sticker-table">{where(t.label)}</span>
              </div>
              <div className="sticker-qr" dangerouslySetInnerHTML={{ __html: codes[t.qr_token] ?? '' }} />
              <p className="sticker-line">{d.headline || DEFAULT_DESIGN.headline}</p>
              {d.sub.trim() && <p className="sticker-sub">{d.sub}</p>}
              <p className="sticker-foot">
                <span>{venueName} · 18+</span>
                <span className="sticker-powered">Powered by Serendine.com</span>
              </p>
            </article>
          ))}
        </div>
      ) : (
        <>
          {/* Label sheets print edge to edge: the label positions are measured from the paper's corner. */}
          <style>{'@page { size: A4; margin: 0; }'}</style>
          {Array.from({ length: Math.ceil(tables.length / 8) }, (_, i) => tables.slice(i * 8, i * 8 + 8)).map((page, i) => (
            <div key={i} className="label-page" style={vars}>
              {page.map((t) => (
                <article key={t.qr_token} className="label8">
                  <div className="sticker-qr label8-qr" dangerouslySetInnerHTML={{ __html: codes[t.qr_token] ?? '' }} />
                  <div className="label8-text">
                    <div className="label8-top">
                      {d.logo ? (
                        <img className="label8-logo" src={d.logo} alt={venueName} />
                      ) : (
                        <span className="sticker-brand label8-brand">Serendine</span>
                      )}
                    </div>
                    <span className="sticker-table label8-table">{where(t.label)}</span>
                    <p className="label8-line">{d.headline || DEFAULT_DESIGN.headline}</p>
                    <p className="label8-foot">
                      <span>{venueName} · 18+</span>
                      <span className="sticker-powered">Powered by Serendine.com</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
