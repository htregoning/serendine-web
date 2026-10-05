// Venue themes: a venue picks a background, text and accent colour plus a type style,
// and every other shade guests see is worked out from those, keeping text readable.

export type ThemeFont = 'modern' | 'classic' | 'minimal';
export type VenueTheme = { preset: string; bg: string; fg: string; accent: string; font: ThemeFont };

export const SERENDINE_THEME: VenueTheme = { preset: 'serendine', bg: '#0B1A3A', fg: '#FF2E93', accent: '#FF2E93', font: 'modern' };

export const PRESETS: { id: string; name: string; hint: string; theme: VenueTheme }[] = [
  { id: 'serendine', name: 'Serendine', hint: 'Our navy and pink', theme: SERENDINE_THEME },
  {
    id: 'tablecloth',
    name: 'White tablecloth',
    hint: 'Ivory, ink and bronze, classic type',
    theme: { preset: 'tablecloth', bg: '#FAF7F2', fg: '#1F1B16', accent: '#8A6534', font: 'classic' },
  },
  {
    id: 'cafe',
    name: 'Modern café',
    hint: 'Clean white with sage green',
    theme: { preset: 'cafe', bg: '#FFFFFF', fg: '#1D2826', accent: '#2E7562', font: 'minimal' },
  },
  {
    id: 'lounge',
    name: 'Lounge',
    hint: 'Charcoal and gold, after dark',
    theme: { preset: 'lounge', bg: '#141414', fg: '#F2EDE4', accent: '#C9A45C', font: 'classic' },
  },
  {
    id: 'beach',
    name: 'Beach club',
    hint: 'Sand, deep teal and coral',
    theme: { preset: 'beach', bg: '#FBF5EA', fg: '#12343B', accent: '#C4501F', font: 'modern' },
  },
];

export const FONT_LABELS: Record<ThemeFont, { name: string; hint: string }> = {
  modern: { name: 'Modern', hint: 'Rounded and friendly' },
  classic: { name: 'Classic', hint: 'Elegant serif headings' },
  minimal: { name: 'Minimal', hint: 'Plain and understated' },
};

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (s: string) => HEX.test(s);

type RGB = [number, number, number];
function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hex([r, g, b]: RGB) {
  return '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// Blend a towards b by t (0..1).
export function mix(a: string, b: string, t: number) {
  const x = rgb(a);
  const y = rgb(b);
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
function luminance(c: string) {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export const isDark = (c: string) => luminance(c) < 0.2;

// Problems that would make the guest screens hard to read, in plain words. Empty means fine.
export function readabilityProblems(t: Pick<VenueTheme, 'bg' | 'fg' | 'accent'>) {
  const out: string[] = [];
  if (!isHex(t.bg) || !isHex(t.fg) || !isHex(t.accent)) return ['Pick all three colours.'];
  if (contrast(t.fg, t.bg) < 4.5) out.push('The text colour is too close to the background to read easily.');
  if (contrast(t.accent, t.bg) < 3) out.push('The highlight colour doesn’t stand out enough from the background.');
  return out;
}

// The faintest blend of text into background that still reads at small sizes.
function softText(fg: string, bg: string, want: number, min: number) {
  for (let t = want; t > 0; t -= 0.04) {
    const c = mix(fg, bg, t);
    if (contrast(c, bg) >= min) return c;
  }
  return fg;
}

// CSS custom properties for the guest screens, or null for the standard Serendine look.
export function themeVars(theme: VenueTheme | null | undefined): Record<string, string> | null {
  if (!theme || theme.preset === 'serendine') return null;
  let { bg, fg, accent } = theme;
  if (!isHex(bg)) bg = '#FFFFFF';
  if (!isHex(fg) || contrast(fg, bg) < 4.5) fg = isDark(bg) ? '#F5F5F5' : '#151515';
  if (!isHex(accent) || contrast(accent, bg) < 3) accent = fg;
  const dark = isDark(bg);
  const onAccent = contrast('#FFFFFF', accent) >= contrast('#111111', accent) ? '#FFFFFF' : '#111111';
  return {
    '--bg': bg,
    '--card': mix(bg, fg, dark ? 0.07 : 0.035),
    '--line': mix(bg, fg, dark ? 0.16 : 0.1),
    '--line-strong': mix(bg, fg, dark ? 0.28 : 0.2),
    '--text': fg,
    '--text-2': softText(fg, bg, 0.15, 7),
    '--muted': softText(fg, bg, 0.4, 5),
    '--faint': softText(fg, bg, 0.5, 3),
    '--accent': accent,
    '--on-accent': onAccent,
    '--bubble': mix(bg, fg, dark ? 0.12 : 0.07),
    '--danger': dark ? '#FF6B6B' : '#C62828',
    '--good': dark ? '#7FC8B5' : '#2E7562',
  };
}

const FONT_CSS: Record<ThemeFont, string> = {
  modern: '',
  classic: 'body{--font-display:var(--font-serif)}',
  minimal: 'body{--font-display:var(--font-body)}',
};

// A <style> body that re-colours the whole page for a venue.
export function themeCss(theme: VenueTheme | null | undefined) {
  const vars = themeVars(theme);
  if (!vars || !theme) return '';
  const decls = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return `:root{${decls}}html,body{background:${vars['--bg']};color:${vars['--text']}}${FONT_CSS[theme.font] ?? ''}`;
}

// Printed stickers stay light so they photocopy and scan well: a light theme is used as-is,
// a dark one is flipped (its background colour becomes the text on white).
export function stickerColours(t: Pick<VenueTheme, 'bg' | 'fg'>) {
  return isDark(t.bg) ? { bg: '#FFFFFF', fg: t.bg } : { bg: t.bg, fg: t.fg };
}
