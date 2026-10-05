'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createKeyPair, saveKeyPair } from '@/lib/crypto';
import { inTelegram, telegramLink } from '@/lib/telegram';
import { MODE_LABELS, eventDate, eventWindow, type ChatMode, type VenueAtTable } from '@/lib/types';
import { LangToggle, useT } from '@/components/lang';
import Buzz from '@/components/buzz';
import VenueMark from '@/components/venue-mark';

type Props = { token: string; venue: VenueAtTable; signedIn: boolean };

export default function Welcome({ token, venue, signedIn }: Props) {
  // Colours, type and logo come from the venue's theme (see the table layout).
  const t = useT();
  return (
    <main className="shell">
      <div className="row">
        <VenueMark venue={venue} />
        <div className="col grow" style={{ gap: 2 }}>
          <strong>{venue.venue_name}</strong>
          <span className="small">
            {venue.kind === 'event'
              ? [venue.table_label, venue.place, eventDate(venue.starts_at)].filter(Boolean).join(' · ')
              : `${t('Table')} ${venue.table_label}`}
          </span>
        </div>
        <LangToggle />
      </div>
      {eventWindow(venue) === 'open' && <Buzz token={token} />}
      {eventWindow(venue) !== 'open' ? (
        <div className="col" style={{ gap: 12, flex: 1, justifyContent: 'center' }}>
          <h1 className="display">{eventWindow(venue) === 'early' ? t('Not open yet') : t('This event has finished')}</h1>
          <p className="lede">
            {eventWindow(venue) === 'early'
              ? `Check-in for ${venue.venue_name} opens 3 hours before it starts (${eventDate(venue.starts_at)}). Come back then.`
              : `Thanks for coming to ${venue.venue_name}. Your kept connections are still in Serendine.`}
          </p>
          {eventWindow(venue) === 'over' && (
            <a className="btn btn-ghost" href="/connections" style={{ textDecoration: 'none' }}>{t('Your connections')}</a>
          )}
        </div>
      ) : signedIn ? (
        <Profile token={token} venue={venue} />
      ) : (
        <SignIn token={token} venue={venue} />
      )}
    </main>
  );
}

function SignIn({ token, venue }: { token: string; venue: VenueAtTable }) {
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tg, setTg] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const t = useT();
  const redirectTo = () => `${window.location.origin}/auth/callback?next=/t/${token}`;
  const tgLink = telegramLink(token);

  useEffect(() => {
    setTg(inTelegram());
  }, []);

  // Inside Telegram, Google sign-in is blocked; Telegram itself vouches for the person.
  if (tg) {
    return (
      <>
        <h1 className="display">{t('Someone in this room might be worth meeting.')}</h1>
        <div style={{ flex: 1 }} />
        <a className="btn btn-primary" href={`/tg?to=/t/${token}`} style={{ textDecoration: 'none' }}>
          {t('Continue with Telegram')}
        </a>
        <p className="small" style={{ textAlign: 'center' }}>
          {t('18+ only. By continuing you agree to the')} <a href="/terms">{t('terms')}</a> {t('and')} <a href="/privacy">{t('privacy policy')}</a>.
        </p>
      </>
    );
  }

  async function oauth(provider: 'google' | 'apple') {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
    if (error) setError(t('Sign-in did not work. Please try again.'));
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) {
      const limited = error.status === 429 || /rate limit/i.test(error.message);
      setError(
        limited
          ? t('Too many sign-in emails just now. Try Google, or wait a few minutes.')
          : t('We could not send the link. Check the address and try again.'),
      );
    }
    else setSent(true);
  }

  return (
    <>
      <div className="arrive">
        <h1 className="display arrive-title">
          {t('Say hello to')}
          <br />
          <span style={{ color: 'var(--accent)' }}>{t('another table.')}</span>
        </h1>
        <ul className="reassure">
          <li>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            <span>{t('Nobody sees you until you switch on. No number, no profile.')}</span>
          </li>
          <li>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>
            <span>{t('Chat to one table, or the whole room. Private chats are encrypted.')}</span>
          </li>
          <li>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
            <span>{t("Leave whenever you like. It's all cleared after the night.")}</span>
          </li>
        </ul>
        {venue.offer_enabled && (
          <div className="offer-box">
            <span className="eyebrow" style={{ color: 'var(--accent)' }}>{t('Offers tonight')}</span>
            <strong>{t('Sign in to see any offers from {venue}.', { venue: venue.venue_name })}</strong>
          </div>
        )}
      </div>
      <div className="col" style={{ gap: 10 }}>
        {process.env.NEXT_PUBLIC_APPLE_SIGNIN === 'on' && (
          <button className="btn btn-light" onClick={() => oauth('apple')}>{t('Continue with Apple')}</button>
        )}
        <button className="btn btn-light" onClick={() => oauth('google')}>{t('Continue with Google')}</button>
        {tgLink && (
          <a className="btn btn-ghost" href={tgLink} style={{ textDecoration: 'none' }}>
            {t('Open in Telegram')}
          </a>
        )}
        {sent ? (
          <p className="card small" role="status">{t('Check your email for a sign-in link. Open it on this phone.')}</p>
        ) : showEmail ? (
          <form className="row" onSubmit={emailLink}>
            <label htmlFor="email" style={{ position: 'absolute', left: -9999 }}>Email</label>
            <input
              id="email"
              className="input grow"
              type="email"
              required
              autoFocus
              placeholder={t('Your email address')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn-ghost" type="submit">{t('Send link')}</button>
          </form>
        ) : (
          <button className="btn btn-ghost" onClick={() => setShowEmail(true)}>{t('Use my email instead')}</button>
        )}
        {error && <p className="error">{error}</p>}
        <p className="small" style={{ textAlign: 'center', margin: 0 }}>
          {t('18+ only. Your email is never shown to other guests. By continuing you agree to the')}{' '}
          <a href="/terms">{t('terms')}</a> {t('and')} <a href="/privacy">{t('privacy policy')}</a>.
        </p>
        <p className="small" style={{ textAlign: 'center', margin: 0, fontSize: 12 }}>
          {t("Opened from WhatsApp or Instagram? Open this page in Safari or Chrome first, as Google sign-in doesn't work inside those apps.")}
        </p>
      </div>
    </>
  );
}

const ALIAS_IDEAS = ['Blue Jumper', 'Espresso Fan', 'Window Seat', 'Birthday Table', 'First Timer'];

// Check-in is just a name and the 18+ promise. Everything else is optional and asked once inside the room.
function Profile({ token, venue }: { token: string; venue: VenueAtTable }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [alias, setAlias] = useState('');
  const modes = (Object.keys(MODE_LABELS) as ChatMode[]).filter((m) => !venue.allowed_modes || venue.allowed_modes.includes(m));
  const [adult, setAdult] = useState(false);
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter(e: React.FormEvent) {
    e.preventDefault();
    if (!alias.trim()) return setError(t('Add a name or alias so people know who they are talking to.'));
    if (!adult) return setError(t('Please confirm you are 18 or over.'));
    setBusy(true);
    setError(null);
    try {
      const { pair, publicJwk } = await createKeyPair();
      const args = {
        token,
        p_alias: alias.trim(),
        p_mode: modes[0] ?? 'friendly',
        p_opt_in: false,
        p_public_key: publicJwk,
      };
      let { data: visitId, error } = await supabase.rpc('start_visit', { ...args, p_gender: 'unspecified' });
      // Until the database update that adds gender is installed, check in without it.
      if (error && error.code === 'PGRST202') ({ data: visitId, error } = await supabase.rpc('start_visit', args));
      if (error || !visitId) throw error ?? new Error('no visit');
      await saveKeyPair(visitId as string, pair);
      router.replace(`/t/${token}/room?welcome=1`);
    } catch (e) {
      const m = (e as { message?: string } | null)?.message ?? '';
      setError(/not opened yet|has finished|no longer use|not available here/.test(m) ? m + '.' : t('Something went wrong. Please try again.'));
      setBusy(false);
    }
  }

  return (
    <form className="col" style={{ gap: 22, flex: 1 }} onSubmit={enter}>
      <div className="col" style={{ gap: 10, marginTop: 8 }}>
        <h1 className="display">{venue.kind === 'event' ? t('What should people call you today?') : t('What should people call you tonight?')}</h1>
        <p className="lede">{t("A first name or a fun alias. It's all anyone sees.")}</p>
      </div>
      <div className="col">
        <label className="label" htmlFor="alias">{t('Name or alias')}</label>
        <input
          id="alias"
          className="input input-lg"
          maxLength={30}
          autoComplete="given-name"
          placeholder={t('e.g. Harry, or Blue Jumper')}
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
        />
        <div className="chips chips-sm" aria-label={t('Ideas')}>
          {ALIAS_IDEAS.slice(0, 3).map((a) => (
            <button key={a} type="button" className="chip" onClick={() => setAlias(t(a))}>{t(a)}</button>
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        <span>{t('I am 18 or over and agree to the house rules: be kind, take no for an answer.')}</span>
      </label>
      <div style={{ flex: 1 }} />
      <p className="small" style={{ margin: 0 }}>
        {venue.kind === 'event'
          ? t("{venue} will see your name, email and when you checked in and which area you were in, so they can welcome you back. Your chats stay private: nobody but you and the person you're talking to can read them.", { venue: venue.venue_name })
          : t("{venue} will see your name, email and when you visited and where you sat, so they can welcome you back. Your chats stay private: nobody but you and the person you're talking to can read them.", { venue: venue.venue_name })}{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">{t('Privacy policy')}</a>
      </p>
      <p className="small" style={{ margin: 0, textAlign: 'center' }}>{t("Chat style, a selfie and offers can wait. You'll be asked once you're in.")}</p>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? t('Entering…') : t('Enter the room')}
      </button>
    </form>
  );
}
