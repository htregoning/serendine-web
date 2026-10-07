'use client';

import { useEffect, useState } from 'react';

// The calm, businesslike look for staff and admin screens (guests keep the venue's own look).
// Light by default; each device can switch to dark for evening service. A venue's own brand colour
// becomes the accent on its staff screen when it reads well on the background.
const LIGHT = {
  '--bg': '#F4F5F7', '--card': '#FFFFFF', '--line': '#E3E6EB', '--line-strong': '#C8CDD5',
  '--text': '#1B2330', '--text-2': '#3A4453', '--muted': '#5D6878', '--faint': '#8892A0',
  '--accent': '#2F5BD3', '--on-accent': '#FFFFFF', '--good': '#1E8A5A', '--danger': '#C73A3A', '--bubble': '#EEF1F6',
};
const DARK = {
  '--bg': '#111418', '--card': '#1A1F26', '--line': '#2A313B', '--line-strong': '#3A4350',
  '--text': '#E8ECF1', '--text-2': '#C4CBD5', '--muted': '#9AA4B2', '--faint': '#7A8494',
  '--accent': '#7EA2FF', '--on-accent': '#0B1020', '--good': '#5CC79A', '--danger': '#FF6B6B', '--bubble': '#222833',
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const decls = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');

export function workCss(accent?: string | null) {
  let light = '';
  let dark = '';
  if (accent && HEX.test(accent)) {
    if (contrast(accent, LIGHT['--card']) >= 3) {
      light = `--accent:${accent};--on-accent:${lum(accent) > 0.4 ? '#111111' : '#FFFFFF'};`;
    }
    if (contrast(accent, DARK['--card']) >= 3) {
      dark = `--accent:${accent};--on-accent:${lum(accent) > 0.4 ? '#111111' : '#FFFFFF'};`;
    }
  }
  return (
    `:root{${decls(LIGHT)};${light}}` +
    `html[data-work="dark"]{${decls(DARK)};${dark}}` +
    `html,body{background:var(--bg);color:var(--text)}`
  );
}

const KEY = 'serendine-work-dark';

export default function WorkTheme({ accent }: { accent?: string | null }) {
  useEffect(() => {
    let dark = false;
    try {
      dark = localStorage.getItem(KEY) === '1';
    } catch {
      /* private mode */
    }
    document.documentElement.dataset.work = dark ? 'dark' : 'light';
  }, []);
  return <style dangerouslySetInnerHTML={{ __html: workCss(accent) }} />;
}

// Light / dark switch for this device.
export function WorkThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.work === 'dark'), []);
  function flip() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.work = next ? 'dark' : 'light';
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* private mode */
    }
  }
  return (
    <button className="btn btn-ghost btn-sm" onClick={flip} aria-pressed={dark} title="Switch screen colours">
      {dark ? 'Light screen' : 'Dark screen'}
    </button>
  );
}
