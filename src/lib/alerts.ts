// Gentle alerts for new messages and service updates.
// Browsers only allow sound after the person has tapped something on the page,
// which every guest has done by the time they're in the room.

let ctx: AudioContext | null = null;

export function chime(notes: number[] = [660, 880]) {
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = W.AudioContext ?? W.webkitAudioContext;
    if (!Ctx) return;
    ctx = ctx ?? new Ctx();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t0 + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  } catch {
    // Sound is a nice-to-have.
  }
}

// Phones only allow sound once the person has tapped the page. Call this when
// the screen loads: the first tap anywhere quietly switches sound on for later.
export function unlockAudio() {
  const unlock = () => {
    try {
      const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctx = W.AudioContext ?? W.webkitAudioContext;
      if (!Ctx) return;
      ctx = ctx ?? new Ctx();
      if (ctx.state === 'suspended') ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
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
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    // Not supported (e.g. iPhone Safari): ignore.
  }
}

export function alertGuest() {
  chime();
  buzz();
}

// Show a count in the browser tab, e.g. "(2) Serendine".
export function setTabCount(n: number) {
  const base = 'Serendine';
  document.title = n > 0 ? `(${n}) ${base}` : base;
}
