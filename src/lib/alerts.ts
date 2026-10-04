// In-app sounds and vibration for new messages, drinks and service updates.
// Browsers only allow sound after the person has tapped something on the page,
// so screens call unlockAudio() when they load.

export type SoundKind = 'message' | 'drink' | 'staff' | 'update';

let ctx: AudioContext | null = null;
const SOUND_KEY = 'serendine-sound';

function audio(): AudioContext | null {
  const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctx = W.AudioContext ?? W.webkitAudioContext;
  if (!Ctx) return null;
  ctx = ctx ?? new Ctx();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Sound is on unless the person has switched it off on this device.
export function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Private browsing: the switch just won't be remembered.
  }
}

type Tone = { f: number; at: number; len: number; vol?: number; type?: OscillatorType; to?: number };

function tones(list: Tone[]) {
  try {
    const c = audio();
    if (!c) return;
    const master = c.createGain();
    master.gain.value = 0.9;
    master.connect(c.destination);
    const t0 = c.currentTime + 0.01;
    for (const t of list) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = t.type ?? 'sine';
      osc.frequency.setValueAtTime(t.f, t0 + t.at);
      if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, t0 + t.at + t.len);
      const peak = t.vol ?? 0.14;
      gain.gain.setValueAtTime(0.0001, t0 + t.at);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + t.at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + t.at + t.len);
      osc.connect(gain).connect(master);
      osc.start(t0 + t.at);
      osc.stop(t0 + t.at + t.len + 0.02);
    }
  } catch {
    // Sound is a nice-to-have.
  }
}

// Each event has its own sound, so you can tell them apart without looking.
const SOUNDS: Record<SoundKind, Tone[]> = {
  // A soft, rising two-note "ding-ding" for a new message.
  message: [
    { f: 784, at: 0, len: 0.28 },
    { f: 1175, at: 0.13, len: 0.4 },
    { f: 2350, at: 0.13, len: 0.25, vol: 0.025 },
  ],
  // Two glasses clinking: bright, short, slightly detuned partials.
  drink: [
    { f: 2637, at: 0, len: 0.35, vol: 0.09, type: 'triangle' },
    { f: 3951, at: 0, len: 0.22, vol: 0.04 },
    { f: 2794, at: 0.14, len: 0.5, vol: 0.1, type: 'triangle' },
    { f: 4186, at: 0.14, len: 0.3, vol: 0.04 },
  ],
  // A front-desk bell, rung twice, loud enough for a busy floor.
  staff: [
    { f: 1318, at: 0, len: 0.55, vol: 0.2, type: 'triangle' },
    { f: 2637, at: 0, len: 0.3, vol: 0.05 },
    { f: 1318, at: 0.32, len: 0.7, vol: 0.2, type: 'triangle' },
    { f: 2637, at: 0.32, len: 0.35, vol: 0.05 },
  ],
  // A gentle falling pair for "on its way".
  update: [
    { f: 988, at: 0, len: 0.25 },
    { f: 740, at: 0.14, len: 0.4 },
  ],
};

const BUZZ: Record<SoundKind, number[]> = {
  message: [120, 60, 120],
  drink: [60, 40, 60, 40, 160],
  staff: [250, 100, 250, 100, 250],
  update: [200],
};

export function playSound(kind: SoundKind, { force = false } = {}) {
  if (!force && !soundOn()) return;
  tones(SOUNDS[kind]);
  buzz(BUZZ[kind]);
}

// Older name, kept for screens that still use it.
export function chime(notes: number[] = [660, 880]) {
  if (!soundOn()) return;
  tones(notes.map((f, i) => ({ f, at: i * 0.16, len: 0.3, vol: 0.12 })));
}

// Phones only allow sound once the person has tapped the page. Call this when
// the screen loads: the first tap anywhere quietly switches sound on for later.
export function unlockAudio() {
  const unlock = () => {
    try {
      const c = audio();
      if (c) {
        const src = c.createBufferSource();
        src.buffer = c.createBuffer(1, 1, 22050);
        src.connect(c.destination);
        src.start(0);
      }
    } catch {
      // ignore
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('touchend', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('touchend', unlock);
  window.addEventListener('keydown', unlock);
}

export function buzz(pattern: number | number[] = [120, 60, 120]) {
  try {
    if (soundOn() && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    // Not supported (e.g. iPhone Safari): ignore.
  }
}

export function alertGuest(kind: SoundKind = 'message') {
  playSound(kind);
}

// Show a count in the browser tab, e.g. "(2) Serendine".
export function setTabCount(n: number) {
  const base = 'Serendine';
  document.title = n > 0 ? `(${n}) ${base}` : base;
}
