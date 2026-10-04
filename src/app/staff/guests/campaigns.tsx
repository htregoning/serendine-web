'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Audience = 'all' | 'regulars' | 'birthdays' | 'lapsed' | 'recent';
type History = { created_at: string; audience: string; subject: string; recipients: number; delivered: number };

const AUDIENCES: [Audience, string][] = [
  ['all', 'Everyone OK to contact'],
  ['regulars', 'Regulars (2+ visits)'],
  ['birthdays', 'Birthdays this month'],
  ['lapsed', 'Not back in 30 days'],
  ['recent', 'Visited in the last 30 days'],
];

const IDEAS: Record<Audience, { subject: string; message: string }> = {
  all: { subject: 'Live music this Friday', message: 'Live music this Friday from 9pm. Show this email for a free dessert.\n\nSee you soon!' },
  regulars: { subject: 'A thank-you for our regulars', message: 'You’ve been in more than once, so the next drink is on us. Show this email at the bar.' },
  birthdays: { subject: 'Happy birthday from us', message: 'Happy birthday! Come and celebrate this month and dessert is on us. Show this email to your server.' },
  lapsed: { subject: 'We miss you', message: 'It’s been a while! Come back this week and get 20% off your bill. Show this email to your server.' },
  recent: { subject: 'Thanks for coming in', message: 'Thanks for visiting us recently. We’d love to see you again: book your table for this weekend.' },
};

// "Bring back past guests": an email to guests who agreed to hear from the venue.
export default function Campaigns({ venueId }: { venueId: string }) {
  const [supabase] = useState(() => createClient());
  const [audience, setAudience] = useState<Audience>('all');
  const [counts, setCounts] = useState<Partial<Record<Audience, number>>>({});
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<History[]>([]);

  const load = useCallback(async () => {
    const results = await Promise.all(
      AUDIENCES.map(async ([a]) => {
        const { data } = await supabase.rpc('campaign_audience', { v: venueId, p_audience: a });
        return [a, ((data as unknown[] | null) ?? []).length] as const;
      }),
    );
    setCounts(Object.fromEntries(results));
    const { data } = await supabase.rpc('venue_campaign_history', { v: venueId });
    setHistory((data as History[] | null) ?? []);
  }, [supabase, venueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, audience, subject, message }),
    });
    const out = (await res.json().catch(() => ({}))) as { sent?: number; total?: number; error?: string };
    setBusy(false);
    setConfirm(false);
    if (out.error) return setMsg(out.error);
    setMsg(
      out.sent === out.total
        ? `Sent to ${out.sent} guest${out.sent === 1 ? '' : 's'}. Replies come to your email.`
        : `Sent to ${out.sent} of ${out.total}. The rest hit today’s sending limit; try again tomorrow.`,
    );
    setSubject('');
    setMessage('');
    load();
  }

  const n = counts[audience];

  return (
    <section className="card col" style={{ gap: 12 }} aria-label="Message past guests">
      <strong>Bring guests back</strong>
      <span className="small">
        Email guests who ticked &quot;send me offers&quot;. Each email has an unsubscribe link, and replies come straight to you.
        Up to 2 a week.
      </span>
      <div className="chips">
        {AUDIENCES.map(([a, label]) => (
          <button key={a} className="chip" aria-pressed={audience === a} onClick={() => setAudience(a)}>
            {label}
            {counts[a] !== undefined ? ` · ${counts[a]}` : ''}
          </button>
        ))}
      </div>
      <div className="col" style={{ gap: 6 }}>
        <label className="label" htmlFor="c-subject">Subject</label>
        <input id="c-subject" className="input" maxLength={120} placeholder={IDEAS[audience].subject} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="col" style={{ gap: 6 }}>
        <label className="label" htmlFor="c-message">Message</label>
        <textarea id="c-message" className="input" rows={5} maxLength={2000} placeholder={IDEAS[audience].message} value={message} onChange={(e) => setMessage(e.target.value)} />
        <button
          className="link-quiet small"
          onClick={() => {
            setSubject(IDEAS[audience].subject);
            setMessage(IDEAS[audience].message);
          }}
        >
          Use the example
        </button>
      </div>
      {confirm ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="small grow">Send to {n ?? 0} guest{n === 1 ? '' : 's'} now?</span>
          <button className="btn btn-primary btn-sm" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Yes, send'}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)} disabled={busy}>Cancel</button>
        </div>
      ) : (
        <button className="btn btn-primary btn-sm" disabled={!subject.trim() || !message.trim() || !n} onClick={() => setConfirm(true)}>
          {n ? `Send to ${n} guest${n === 1 ? '' : 's'}` : 'Nobody in this group yet'}
        </button>
      )}
      {msg && <span className="small" role="status">{msg}</span>}
      {history.length > 0 && (
        <div className="col" style={{ gap: 4 }}>
          <span className="label">Sent</span>
          {history.map((h) => (
            <span key={h.created_at} className="small">
              {new Date(h.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {h.subject} · {h.delivered}/{h.recipients} delivered
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
