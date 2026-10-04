'use client';

import { useCallback, useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { notify } from '@/lib/push';
import { KIND_LABELS, type AnnouncementKind } from '@/components/venue-news';

type Client = ReturnType<typeof createClient>;
type Sent = { id: string; kind: AnnouncementKind; body: string; created_at: string; expires_at: string };

type Template = { kind: AnnouncementKind; label: string; text: (x: string) => string; minutes: number; needs?: string; placeholder?: string };

const TEMPLATES: Template[] = [
  { kind: 'last_orders', label: 'Last orders', text: (m) => `Last orders in ${m || 15} minutes. Order now from your server.`, minutes: 30, needs: 'minutes', placeholder: '15' },
  { kind: 'happy_hour', label: 'Happy hour ending', text: (m) => `Happy hour ends in ${m || 30} minutes. Last chance for happy hour prices.`, minutes: 30, needs: 'minutes', placeholder: '30' },
  { kind: 'running_low', label: 'Running low', text: (x) => `Running low on ${x || '…'}. Get yours while it lasts.`, minutes: 60, needs: 'what', placeholder: 'oysters' },
  { kind: 'special', label: 'Flash special', text: (x) => x || '', minutes: 60, needs: 'offer', placeholder: 'Fresh oysters just in: half price for the next hour' },
  { kind: 'general', label: 'Other message', text: (x) => x || '', minutes: 60, needs: 'message', placeholder: 'Live music starts at 9 on the terrace' },
];

// The staff screen's "Message everyone here" card.
export default function Announce({ supabase, venueId, guestsHere }: { supabase: Client; venueId: string; guestsHere: number | null }) {
  const [pick, setPick] = useState<Template | null>(null);
  const [value, setValue] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('venue_announcements')
      .select('id, kind, body, created_at, expires_at')
      .eq('venue_id', venueId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(5);
    setSent((data as Sent[] | null) ?? []);
  }, [supabase, venueId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  function choose(t: Template) {
    setPick(t);
    setValue('');
    setText(t.text(''));
    setMsg(null);
  }

  function changeValue(v: string) {
    setValue(v);
    if (pick) setText(pick.text(v));
  }

  async function send() {
    if (!pick || !text.trim() || text.includes('…')) return;
    setBusy(true);
    setMsg(null);
    const minutes = pick.needs === 'minutes' ? Math.max(5, Number(value) || Number(pick.placeholder)) + 10 : pick.minutes;
    const { data, error } = await supabase.rpc('post_announcement', { v: venueId, p_kind: pick.kind, p_body: text.trim(), p_minutes: minutes });
    setBusy(false);
    if (error) {
      setMsg(error.code === 'PGRST202' ? 'Messages need the latest database update (0014).' : error.message);
      return;
    }
    notify('announcement', data as string);
    setMsg(`Sent to everyone checked in${guestsHere ? ` (${guestsHere} guest${guestsHere === 1 ? '' : 's'})` : ''}.`);
    setPick(null);
    setValue('');
    setText('');
    load();
  }

  async function takeDown(id: string) {
    await supabase.rpc('end_announcement', { p_id: id });
    load();
  }

  return (
    <section className="card col" style={{ gap: 12 }} aria-label="Message everyone here">
      <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong className="grow">Message everyone here</strong>
        {guestsHere !== null && <span className="small">{guestsHere} checked in</span>}
      </div>
      <div className="chips">
        {TEMPLATES.map((t) => (
          <button key={t.kind} className="chip" aria-pressed={pick?.kind === t.kind} onClick={() => choose(t)}>
            {t.label}
          </button>
        ))}
      </div>
      {pick && (
        <div className="col" style={{ gap: 8 }}>
          {pick.needs === 'minutes' || pick.needs === 'what' ? (
            <>
              <label className="label" htmlFor="ann-value">{pick.needs === 'minutes' ? 'In how many minutes?' : 'Running low on'}</label>
              <input
                id="ann-value"
                className="input"
                inputMode={pick.needs === 'minutes' ? 'numeric' : 'text'}
                maxLength={pick.needs === 'minutes' ? 3 : 60}
                placeholder={pick.placeholder}
                value={value}
                onChange={(e) => changeValue(pick.needs === 'minutes' ? e.target.value.replace(/\D/g, '') : e.target.value)}
              />
            </>
          ) : null}
          <label className="label" htmlFor="ann-text">Message</label>
          <textarea
            id="ann-text"
            className="input"
            rows={2}
            maxLength={200}
            placeholder={pick.needs === 'offer' || pick.needs === 'message' ? pick.placeholder : undefined}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={send} disabled={busy || !text.trim() || text.includes('…')}>
              {busy ? 'Sending…' : 'Send to everyone here'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPick(null)}>Cancel</button>
          </div>
          <span className="small">Guests see it at the top of their screen and get a notification. Up to 6 messages an hour.</span>
        </div>
      )}
      {msg && <span className="small" role="status">{msg}</span>}
      {sent.length > 0 && (
        <div className="col" style={{ gap: 6 }}>
          <span className="label">Showing to guests now</span>
          {sent.map((a) => (
            <div key={a.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <span className="small grow">
                <b>{KIND_LABELS[a.kind]}:</b> {a.body}
              </span>
              <button className="link-danger" onClick={() => takeDown(a.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
