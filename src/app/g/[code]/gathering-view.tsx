'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import SignInCard from '@/components/sign-in-card';
import PlanReplies from './plan-replies';
import { STATUS_TEXT, inviteUrl, when, whatsappLink, type Gathering } from '@/lib/gatherings';

type Props = { initial: Gathering; signedIn: boolean; logoUrl: string | null; justCreated: boolean; defaultName: string };

const RSVP_LABEL = { going: "I'm in", maybe: 'Maybe', no: "Can't make it" } as const;

// A planned night out: details, who's coming, and "I'm in". The organiser shares it on WhatsApp.
export default function GatheringView({ initial, signedIn, logoUrl, justCreated, defaultName }: Props) {
  const [supabase] = useState(() => createClient());
  const [g, setG] = useState<Gathering>(initial);
  const [name, setName] = useState(defaultName);
  const [logoOk, setLogoOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('https://serendine.com');

  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator.share === 'function');
  }, []);

  const reload = useCallback(async () => {
    const { data } = await supabase.rpc('gathering_by_code', { p_code: initial.code });
    const next = ((data as Gathering[] | null) ?? [])[0];
    if (next) setG(next);
  }, [supabase, initial.code]);

  useEffect(() => {
    const poll = setInterval(reload, 20000);
    return () => clearInterval(poll);
  }, [reload]);

  const link = inviteUrl(origin, g.code);
  const message = `${g.title} at ${g.venue_name}, ${when(g.starts_at)}. Are you in? ${link}`;
  const closed = g.status === 'cancelled' || g.status === 'declined';

  async function answer(rsvp: 'going' | 'maybe' | 'no') {
    if (!name.trim()) return setMsg('Add your name so everyone knows who you are.');
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('rsvp_gathering', { p_code: g.code, p_name: name.trim(), p_rsvp: rsvp });
    setBusy(false);
    if (error) return setMsg(error.message);
    reload();
  }

  async function organiser(action: 'cancel' | 'accept_time') {
    setBusy(true);
    const { error } = await supabase.rpc('organiser_update_gathering', { p_code: g.code, p_action: action });
    setBusy(false);
    if (error) setMsg(error.message);
    reload();
  }

  // The phone's own share sheet: Instagram, Telegram, SMS, email…
  async function shareOther() {
    try {
      await navigator.share({ title: g.title, text: message.replace(` ${link}`, ''), url: link });
    } catch {
      /* closed without sharing */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg(link);
    }
  }

  return (
    <main className="shell">
      <div className="row">
        {logoUrl && logoOk ? (
          <img className="venue-logo" src={logoUrl} alt={g.venue_name} style={{ height: 40 }} onError={() => setLogoOk(false)} />
        ) : (
          <div className="avatar" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>{g.venue_name.charAt(0).toUpperCase()}</div>
        )}
        <div className="col grow" style={{ gap: 1 }}>
          <strong>{g.venue_name}</strong>
          {g.place && <span className="small">{g.place}</span>}
        </div>
      </div>

      {justCreated && g.i_am_organiser && (
        <p className="card small" role="status" style={{ margin: 0 }}>
          Your request is with {g.venue_name}. Now send the link to your friends: they tap &ldquo;I&apos;m in&rdquo; and you&apos;ll all see
          when the venue confirms.
        </p>
      )}

      <div className="col" style={{ gap: 8 }}>
        <span className="eyebrow">{g.organiser_name ? `${g.organiser_name} is planning` : 'A night out'}</span>
        <h1 className="display" style={{ fontSize: 34 }}>{g.title}</h1>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{when(g.starts_at)}</span>
        <span className="small">For about {g.party_size} people{g.note ? ` · ${g.note}` : ''}</span>
      </div>

      {g.offer_text && (
        <div className="offer-row">
          <span className="grow small">
            <b style={{ color: 'var(--accent)' }}>Group offer from {g.venue_name}</b> · {g.offer_text}
          </span>
        </div>
      )}

      <div className={`card col gathering-status status-${g.status}`} style={{ gap: 6 }}>
        <strong>{STATUS_TEXT[g.status]}</strong>
        {g.status === 'suggested' && g.suggested_at && (
          <span>New time: <b>{when(g.suggested_at)}</b></span>
        )}
        {g.venue_note && <span className="small">&ldquo;{g.venue_note}&rdquo; · {g.venue_name}</span>}
        {g.status === 'suggested' && g.i_am_organiser && (
          <button className="btn btn-primary btn-sm" onClick={() => organiser('accept_time')} disabled={busy}>Accept the new time</button>
        )}
      </div>

      {(g.i_am_organiser || (g.my_rsvp && g.my_rsvp !== 'no')) && !closed && (
        <div className="col" style={{ gap: 8 }}>
          <a className="btn btn-primary" href={whatsappLink(message)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            {g.i_am_organiser ? 'Invite friends on WhatsApp' : 'Invite more friends on WhatsApp'}
          </a>
          <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {canShare && <button className="btn btn-ghost btn-sm" onClick={shareOther}>Share another way</button>}
            <button className="btn btn-ghost btn-sm" onClick={copy}>{copied ? 'Link copied' : 'Copy the link'}</button>
          </div>
        </div>
      )}

      <div className="col" style={{ gap: 0 }}>
        <span className="eyebrow" style={{ paddingBottom: 6 }}>{g.going} going</span>
        {g.members.length > 0 ? (
          g.members.map((m, i) => (
            <div key={i} className="row person-row">
              <div className="avatar" style={{ width: 36, height: 36, fontSize: 15 }}>{m.name.charAt(0).toUpperCase()}</div>
              <span className="grow">{m.name}</span>
              <span className="small">{RSVP_LABEL[m.rsvp]}</span>
            </div>
          ))
        ) : (
          <span className="small" style={{ padding: '6px 2px' }}>Answer below to see who else is coming and join the replies.</span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {!closed &&
        (!signedIn ? (
          <SignInCard next={`/g/${g.code}`} title="Sign in to say you're in" lede="So the organiser and the venue know who's coming. Your email is never shown to the group." />
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {!g.my_rsvp && (
              <div className="col">
                <label className="label" htmlFor="g-name">Your name</label>
                <input id="g-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div className="row" style={{ gap: 8 }}>
              {(['going', 'maybe', 'no'] as const).map((r) => (
                <button key={r} className={g.my_rsvp === r ? 'btn btn-primary grow' : 'btn btn-ghost grow'} onClick={() => answer(r)} disabled={busy}>
                  {RSVP_LABEL[r]}
                </button>
              ))}
            </div>
            {g.i_am_organiser && (
              <button className="link-danger" style={{ alignSelf: 'center' }} onClick={() => organiser('cancel')} disabled={busy}>Call off this plan</button>
            )}
          </div>
        ))}
      {msg && <p className="error" role="status" style={{ margin: 0 }}>{msg}</p>}
      {signedIn && g.my_rsvp && <PlanReplies supabase={supabase} code={g.code} canDelete={g.i_am_organiser} />}
      <a className="small" href="/plan" style={{ textAlign: 'center' }}>Plan your own night out</a>
    </main>
  );
}
