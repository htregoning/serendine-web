'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { StaffVenue } from './staff-screen';

// Manager settings for Google reviews, Instagram, birthdays and the Monday report email.
export default function GrowthSettings({ venue, onSaved }: { venue: StaffVenue; onSaved: () => void }) {
  const [supabase] = useState(() => createClient());
  const [google, setGoogle] = useState(venue.google_review_url ?? '');
  const [insta, setInsta] = useState(venue.instagram_handle ?? '');
  const [birthday, setBirthday] = useState(venue.birthday_offer ?? '');
  const [weekly, setWeekly] = useState(venue.weekly_report !== false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const g = google.trim();
    if (g && !/^https:\/\//.test(g)) return setMsg('The Google review link should start with https://');
    const handle = insta.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
    if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) return setMsg('That Instagram name doesn’t look right.');
    setBusy('save');
    const { error } = await supabase
      .from('venues')
      .update({
        google_review_url: g || null,
        instagram_handle: handle || null,
        birthday_offer: birthday.trim() || null,
        weekly_report: weekly,
      })
      .eq('id', venue.id);
    setBusy(null);
    setMsg(error ? 'Those settings did not save.' : 'Saved.');
    if (!error) {
      setInsta(handle);
      onSaved();
    }
  }

  async function emailReport() {
    setBusy('report');
    setMsg(null);
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId: venue.id }),
    });
    const out = (await res.json().catch(() => ({}))) as { sent?: number; to?: string; error?: string };
    setBusy(null);
    setMsg(out.error ?? (out.sent ? `Sent to ${out.to}. Check your inbox.` : 'The email did not send. Try again in a minute.'));
  }

  return (
    <div className="card col" style={{ gap: 14 }}>
      <strong>Reviews, birthdays and reports</strong>

      <div className="col">
        <label className="label" htmlFor="g-review">Google review link</label>
        <input id="g-review" className="input" inputMode="url" placeholder="https://g.page/r/…/review" value={google} onChange={(e) => setGoogle(e.target.value)} />
        <span className="small">
          Guests who rate their visit are invited to review you here. Find it in your Google Business Profile under &quot;Ask for
          reviews&quot;.
        </span>
      </div>

      <div className="col">
        <label className="label" htmlFor="g-insta">Instagram name</label>
        <input id="g-insta" className="input" placeholder="@yourvenue" value={insta} onChange={(e) => setInsta(e.target.value)} />
        <span className="small">Guests are asked to tag you when they leave.</span>
      </div>

      <div className="col">
        <label className="label" htmlFor="g-bday">Birthday treat (optional)</label>
        <input id="g-bday" className="input" maxLength={120} placeholder="e.g. A free dessert in your birthday month" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        <span className="small">Shown when guests add their birthday at check-in. Message birthday guests from the Guests page.</span>
      </div>

      <label className="check">
        <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
        <span>Email managers a report every Monday morning</span>
      </label>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={save} disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        <button className="btn btn-ghost btn-sm" onClick={emailReport} disabled={busy === 'report'}>
          {busy === 'report' ? 'Sending…' : 'Email me this week’s report'}
        </button>
      </div>
      {msg && <p className="small" role="status">{msg}</p>}
    </div>
  );
}
