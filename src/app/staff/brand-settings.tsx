'use client';
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MODE_LABELS, type ChatMode } from '@/lib/types';
import {
  FONT_LABELS,
  PRESETS,
  SERENDINE_THEME,
  isHex,
  readabilityProblems,
  stickerColours,
  themeVars,
  type ThemeFont,
  type VenueTheme,
} from '@/lib/theme';

export type BrandInitial = {
  theme: VenueTheme;
  modes: ChatMode[];
  logoUrl: string | null;
};

type Props = { venueId: string; venueName: string; venueSlug: string; offer: string | null; initial: BrandInitial; onSaved: () => void };

const ALL_MODES = Object.keys(MODE_LABELS) as ChatMode[];
const FONT_VAR: Record<ThemeFont, string> = {
  modern: 'var(--font-display)',
  classic: 'var(--font-serif)',
  minimal: 'var(--font-body)',
};

// Managers choose how Serendine looks to their guests: a ready-made style or their own colours,
// a type style, their logo, and which chat modes guests can pick.
export default function BrandSettings({ venueId, venueName, venueSlug, offer, initial, onSaved }: Props) {
  const [supabase] = useState(() => createClient());
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<VenueTheme>(initial.theme);
  const [modes, setModes] = useState<ChatMode[]>(initial.modes);
  const [logo, setLogo] = useState<string | null>(initial.logoUrl); // a URL or a new data: image
  const [logoChanged, setLogoChanged] = useState(false);
  const [matchStickers, setMatchStickers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const problems = useMemo(() => (theme.preset === 'serendine' ? [] : readabilityProblems(theme)), [theme]);
  const vars = themeVars(theme) ?? {
    '--bg': '#0B1A3A', '--card': '#12244D', '--line': '#213A70', '--line-strong': '#2D4A88', '--text': '#FF2E93',
    '--text-2': '#FF7DB8', '--muted': '#E86AA8', '--faint': '#CC6AA0', '--accent': '#FF2E93', '--on-accent': '#12030C',
  };

  function pick(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (p) setTheme(p.theme);
    setMsg(null);
  }
  function colour(key: 'bg' | 'fg' | 'accent', value: string) {
    const base = theme.preset === 'serendine' ? SERENDINE_THEME : theme;
    setTheme({ ...base, [key]: value.toUpperCase(), preset: 'custom' });
    setMsg(null);
  }
  function toggleMode(m: ChatMode) {
    setModes((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : ALL_MODES.filter((x) => x === m || cur.includes(x))));
  }

  function chooseLogo(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setMsg('Use a PNG, JPG or WebP image.');
    if (file.size > 200 * 1024) return setMsg('That logo is over 200 KB. Try a smaller PNG (about 600 pixels wide is plenty).');
    const reader = new FileReader();
    reader.onload = () => {
      setLogo(String(reader.result));
      setLogoChanged(true);
      setMsg(null);
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    if (problems.length) return setMsg(problems[0]);
    if (modes.length === 0) return setMsg('Offer at least one chat mode.');
    setBusy(true);
    setMsg(null);
    const sticker = matchStickers && theme.preset !== 'serendine' ? stickerColours(theme) : null;
    const { error } = await supabase.rpc('venue_update_brand', {
      v: venueId,
      p_preset: theme.preset,
      p_bg: theme.bg,
      p_fg: theme.fg,
      p_accent: theme.accent,
      p_font: theme.font,
      p_modes: modes,
      p_logo: logoChanged ? (logo ?? '') : null,
      p_keep_logo: !logoChanged,
      p_sticker_bg: sticker?.bg ?? null,
      p_sticker_fg: sticker?.fg ?? null,
    });
    setBusy(false);
    if (error) return setMsg(error.message.includes('logo') ? error.message : 'That did not save. Please try again.');
    setLogoChanged(false);
    setMsg(sticker ? 'Saved. Guests see the new look straight away, and your stickers now match.' : 'Saved. Guests see the new look straight away.');
    onSaved();
  }

  if (!open) {
    return (
      <div className="card col" style={{ gap: 10 }}>
        <strong>Your look</strong>
        <span className="small">
          Guests see the {PRESETS.find((p) => p.id === theme.preset)?.name ?? 'custom'} style. Change your colours, type, logo
          and the chat modes guests can choose.
        </span>
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
          Edit your look
        </button>
      </div>
    );
  }

  return (
    <div className="card col brand" style={{ gap: 16 }}>
      <div className="row">
        <strong className="grow">Your look</strong>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <span className="label">Style</span>
        <div className="brand-presets">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="brand-preset" aria-pressed={theme.preset === p.id} onClick={() => pick(p.id)}>
              <span className="brand-swatch" style={{ background: p.theme.bg }}>
                <i style={{ background: p.theme.fg }} />
                <i style={{ background: p.theme.accent }} />
              </span>
              <span className="col" style={{ gap: 0, alignItems: 'flex-start', textAlign: 'start' }}>
                <b>{p.name}</b>
                <span className="small">{p.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <span className="label">Or your own colours</span>
        <div className="brand-colours">
          {(
            [
              ['bg', 'Background'],
              ['fg', 'Text'],
              ['accent', 'Highlight'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="brand-colour">
              <input type="color" value={theme[key]} onChange={(e) => colour(key, e.target.value)} />
              <span className="col" style={{ gap: 2 }}>
                <span className="small">{label}</span>
                <input
                  className="input brand-hex"
                  value={theme[key]}
                  maxLength={7}
                  onChange={(e) => {
                    const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
                    if (/^#[0-9a-f]{0,6}$/i.test(v)) setTheme({ ...theme, [key]: v.toUpperCase(), preset: 'custom' });
                  }}
                  aria-label={`${label} colour code`}
                />
              </span>
            </label>
          ))}
        </div>
        {problems.length > 0 && isHex(theme.bg) && (
          <p className="error" role="status" style={{ margin: 0 }}>{problems.join(' ')}</p>
        )}
      </div>

      <div className="col" style={{ gap: 8 }}>
        <span className="label">Type style</span>
        <div className="chips">
          {(Object.keys(FONT_LABELS) as ThemeFont[]).map((f) => (
            <button
              key={f}
              type="button"
              className="chip"
              aria-pressed={theme.font === f}
              onClick={() => setTheme({ ...(theme.preset === 'serendine' ? { ...SERENDINE_THEME, preset: 'custom' } : theme), font: f })}
              style={{ fontFamily: FONT_VAR[f] }}
            >
              {FONT_LABELS[f].name}
            </button>
          ))}
        </div>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <span className="label">Logo</span>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {logo && <img src={logo} alt="" className="brand-logo-thumb" onError={() => setLogo(null)} />}
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            {logo ? 'Replace logo' : 'Add logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => chooseLogo(e.target.files?.[0])} />
          </label>
          {logo && (
            <button className="link-danger" onClick={() => { setLogo(null); setLogoChanged(true); }}>Remove</button>
          )}
        </div>
        <span className="small">
          A PNG with a see-through background works best, in a colour that shows up on your background. It also goes on your
          table stickers.
        </span>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <span className="label">Chat modes guests can choose</span>
        {ALL_MODES.map((m) => (
          <label key={m} className="check">
            <input type="checkbox" checked={modes.includes(m)} onChange={() => toggleMode(m)} />
            <span>{MODE_LABELS[m]}</span>
          </label>
        ))}
        <span className="small">With only one mode, guests aren&apos;t asked. Switch dating off for family or business venues.</span>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <span className="label">Preview</span>
        <Preview vars={vars} font={theme.font} name={venueName} logo={logo} offer={offer} modes={modes} />
      </div>

      {theme.preset !== 'serendine' && (
        <label className="check">
          <input type="checkbox" checked={matchStickers} onChange={(e) => setMatchStickers(e.target.checked)} />
          <span>Restyle our table stickers to match (the QR code always sits on white, so it scans in any colours)</span>
        </label>
      )}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || problems.length > 0 || modes.length === 0}>
          {busy ? 'Saving…' : 'Save look'}
        </button>
        <a className="btn btn-ghost btn-sm" href={`/staff/stickers?v=${encodeURIComponent(venueSlug)}`} style={{ textDecoration: 'none' }}>Print stickers</a>
      </div>
      {msg && <p className="small" role="status" style={{ margin: 0 }}>{msg}</p>}
    </div>
  );
}

// A small phone-sized copy of the guest welcome screen in the chosen look.
function Preview({
  vars,
  font,
  name,
  logo,
  offer,
  modes,
}: {
  vars: Record<string, string>;
  font: ThemeFont;
  name: string;
  logo: string | null;
  offer: string | null;
  modes: ChatMode[];
}) {
  // Modern is the page's own display font, so it needs no override (and must not refer to itself).
  const style = {
    ...vars,
    ...(font === 'modern' ? {} : { '--font-display': FONT_VAR[font] }),
    background: vars['--bg'],
    color: vars['--text'],
  } as React.CSSProperties;
  return (
    <div className="brand-preview" style={style} aria-hidden="true">
      <div className="row" style={{ gap: 10 }}>
        {logo ? (
          <img src={logo} alt="" style={{ height: 32, maxWidth: 110, objectFit: 'contain' }} />
        ) : (
          <div className="avatar" style={{ width: 32, height: 32, fontSize: 15, background: 'var(--accent)', color: 'var(--on-accent)' }}>
            {name.trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div className="col" style={{ gap: 0 }}>
          <strong style={{ fontSize: 13 }}>{name}</strong>
          <span className="small" style={{ fontSize: 11 }}>Checked in at Table 12</span>
        </div>
      </div>
      <div className="buzz" style={{ fontSize: 12 }}>
        <span className="buzz-dot" />
        <span>9 people here tonight · 4 open to chat</span>
      </div>
      <span className="display" style={{ fontSize: 22, color: 'var(--accent)', lineHeight: 1.15 }}>How should people know you tonight?</span>
      <span className="label" style={{ fontSize: 11 }}>Name or alias</span>
      <div className="input" style={{ height: 36, fontSize: 13, display: 'flex', alignItems: 'center', color: 'var(--muted)' }}>e.g. Harry, or Blue Jumper</div>
      {modes.length > 1 && (
        <div className="chips" style={{ gap: 6 }}>
          {modes.map((m, i) => (
            <span key={m} className="chip" aria-pressed={i === 0} style={{ height: 30, padding: '0 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center' }}>
              {MODE_LABELS[m]}
            </span>
          ))}
        </div>
      )}
      {offer && (
        <div className="card offer" style={{ padding: 10, fontSize: 12 }}>
          <span className="eyebrow" style={{ color: 'var(--accent)', fontSize: 10 }}>Tonight&apos;s welcome offer</span>
          <div>{offer}</div>
        </div>
      )}
      <span className="btn btn-primary" style={{ height: 40, fontSize: 14 }}>Enter the room</span>
      <span className="powered-by" style={{ padding: 0 }}>
        Powered by <span>Serendine</span>
      </span>
    </div>
  );
}
