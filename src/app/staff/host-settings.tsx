'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Tone = 'lively' | 'relaxed' | 'family';

const TONES: { value: Tone; label: string; hint: string }[] = [
  { value: 'lively', label: 'Lively', hint: 'Playful and upbeat, like a great bartender' },
  { value: 'relaxed', label: 'Relaxed', hint: 'Warm and understated' },
  { value: 'family', label: 'Family-friendly', hint: 'Wholesome, no alcohol talk' },
];

// Manager switch for Seren, the AI host that keeps a quiet group chat going.
export default function HostSettings({ venueId, enabled, tone }: { venueId: string; enabled: boolean; tone: Tone }) {
  const [supabase] = useState(() => createClient());
  const [on, setOn] = useState(enabled);
  const [mood, setMood] = useState<Tone>(tone);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(next: { host_enabled?: boolean; host_tone?: Tone }) {
    setMsg(null);
    const { error } = await supabase.from('venues').update(next).eq('id', venueId);
    if (error) {
      setMsg('That did not save. Please try again.');
      return false;
    }
    setMsg('Saved.');
    return true;
  }

  return (
    <div className="card col" style={{ gap: 12 }}>
      <strong>Seren, the AI host</strong>
      <span className="small">
        When three or more tables are open to chat and the group goes quiet for 10 minutes, Seren posts a light question, a quick
        poll or a reminder of your offer and announcements. Guests can also ask Seren things by name. Seren is clearly labelled as
        AI, only joins the group chat, and never sees private chats.
      </span>
      <label className="check">
        <input
          type="checkbox"
          checked={on}
          onChange={async (e) => {
            const next = e.target.checked;
            setOn(next);
            if (!(await save({ host_enabled: next }))) setOn(!next);
          }}
        />
        <span>Let Seren host our group chat</span>
      </label>
      <div className="col" style={{ gap: 6 }}>
        <span className="label">Tone</span>
        {TONES.map((t) => (
          <label key={t.value} className="check">
            <input
              type="radio"
              name="host-tone"
              checked={mood === t.value}
              onChange={async () => {
                const prev = mood;
                setMood(t.value);
                if (!(await save({ host_tone: t.value }))) setMood(prev);
              }}
            />
            <span>
              {t.label} <span className="small">· {t.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {msg && <p className="small" role="status" style={{ margin: 0 }}>{msg}</p>}
    </div>
  );
}
