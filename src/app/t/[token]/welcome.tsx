'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createKeyPair, saveKeyPair } from '@/lib/crypto';
import { inTelegram, telegramLink } from '@/lib/telegram';
import { GENDER_LABELS, MODE_LABELS, eventDate, eventWindow, type ChatMode, type Gender, type VenueAtTable } from '@/lib/types';
import { LangToggle, useLang, useT } from '@/components/lang';
import { monthNames } from '@/lib/i18n';
import Buzz from '@/components/buzz';

type Props = { token: string; venue: VenueAtTable; signedIn: boolean };

export default function Welcome({ token, venue, signedIn }: Props) {
  // Always the Serendine brand colours (venue colours can return with white-labelling).
  const style = {} as React.CSSProperties;
  const t = useT();
  return (
    <main className="shell" style={style}>
      <div className="row">
        <div className="avatar" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
          {venue.venue_name.trim().charAt(0).toUpperCase()}
        </div>
        <div className="col grow" style={{ gap: 2 }}>
          <strong>{venue.venue_name}</strong>
          <span className="small">
            {venue.kind === 'event'
              ? [venue.table_label, venue.place, eventDate(venue.starts_at)].filter(Boolean).join(' · ')
              : t('Checked in at {where}', { where: `${t('Table')} ${venue.table_label}` })}
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
        <SignIn token={token} />
      )}
    </main>
  );
}

function SignIn({ token }: { token: string }) {
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tg, setTg] = useState(false);
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
      <h1 className="display">{t('Someone in this room might be worth meeting.')}</h1>
      <p className="lede">
        {t('Say hello to another table, as yourself or by an alias. Nobody sees you until you choose to be seen.')}
      </p>
      <div style={{ flex: 1 }} />
      {process.env.NEXT_PUBLIC_APPLE_SIGNIN === 'on' && (
        <button className="btn btn-light" onClick={() => oauth('apple')}>{t('Continue with Apple')}</button>
      )}
      <button className="btn btn-light" onClick={() => oauth('google')}>{t('Continue with Google')}</button>
      {tgLink && (
        <a className="btn btn-ghost" href={tgLink} style={{ textDecoration: 'none' }}>
          {t('Open in Telegram')}
        </a>
      )}
      <p className="small" style={{ textAlign: 'center', margin: 0 }}>
        {t("Opened from WhatsApp or Instagram? Open this page in Safari or Chrome first, as Google sign-in doesn't work inside those apps.")}
      </p>
      <div className="divider">{t('or')}</div>
      {sent ? (
        <p className="card small">{t('Check your email for a sign-in link. Open it on this phone.')}</p>
      ) : (
        <form className="row" onSubmit={emailLink}>
          <label htmlFor="email" className="sr-only" style={{ position: 'absolute', left: -9999 }}>Email</label>
          <input
            id="email"
            className="input grow"
            type="email"
            required
            placeholder={t('Use email instead')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn btn-ghost" type="submit">{t('Send link')}</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <p className="small" style={{ textAlign: 'center' }}>
        {t('18+ only. Your email is never shown to other guests. By continuing you agree to the')}{' '}
        <a href="/terms">{t('terms')}</a> {t('and')} <a href="/privacy">{t('privacy policy')}</a>.
      </p>
    </>
  );
}

function Profile({ token, venue }: { token: string; venue: VenueAtTable }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [alias, setAlias] = useState('');
  const [mode, setMode] = useState<ChatMode>('friendly');
  const [gender, setGender] = useState<Gender | null>(null);
  const [adult, setAdult] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const t = useT();
  const lang = useLang();
  const [bDay, setBDay] = useState('');
  const [bMonth, setBMonth] = useState('');
  const [bdayOffer, setBdayOffer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The venue's birthday treat, and any birthday this guest saved before (after update 0016).
  useEffect(() => {
    supabase
      .from('venues')
      .select('birthday_offer')
      .eq('id', venue.venue_id)
      .maybeSingle()
      .then(({ data }: { data: { birthday_offer?: string | null } | null }) => setBdayOffer(data?.birthday_offer ?? null));
    supabase.rpc('my_birthday').then(({ data }: { data: { birth_day: number | null; birth_month: number | null }[] | null }) => {
      const b = data?.[0];
      if (b?.birth_day && b?.birth_month) {
        setBDay(String(b.birth_day));
        setBMonth(String(b.birth_month));
      }
    });
  }, [supabase, venue.venue_id]);
  const [error, setError] = useState<string | null>(null);

  async function enter(e: React.FormEvent) {
    e.preventDefault();
    if (!alias.trim()) return setError(t('Add a name or alias so people know who they are talking to.'));
    if (!gender) return setError(t('Please choose male, female or prefer not to say.'));
    if (!adult) return setError(t('Please confirm you are 18 or over.'));
    setBusy(true);
    setError(null);
    try {
      const { pair, publicJwk } = await createKeyPair();
      const args = {
        token,
        p_alias: alias.trim(),
        p_mode: mode,
        p_opt_in: venue.offer_enabled ? optIn : false,
        p_public_key: publicJwk,
      };
      let { data: visitId, error } = await supabase.rpc('start_visit', { ...args, p_gender: gender });
      // Until the database update that adds gender is installed, check in without it.
      if (error && error.code === 'PGRST202') ({ data: visitId, error } = await supabase.rpc('start_visit', args));
      if (error || !visitId) throw error ?? new Error('no visit');
      await saveKeyPair(visitId as string, pair);
      if (optIn && bDay && bMonth) await supabase.rpc('set_my_birthday', { p_day: Number(bDay), p_month: Number(bMonth) });
      router.replace(`/t/${token}/room`);
    } catch (e) {
      const m = (e as { message?: string } | null)?.message ?? '';
      setError(/not opened yet|has finished|no longer use/.test(m) ? m + '.' : t('Something went wrong. Please try again.'));
      setBusy(false);
    }
  }

  return (
    <form className="col" style={{ gap: 20, flex: 1 }} onSubmit={enter}>
      <h1 className="display">{venue.kind === 'event' ? t('How should people know you today?') : t('How should people know you tonight?')}</h1>
      <div className="col">
        <label className="label" htmlFor="alias">{t('Name or alias')}</label>
        <input
          id="alias"
          className="input"
          maxLength={30}
          placeholder={t('e.g. Harry, or Blue Jumper')}
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
        />
      </div>
      <div className="col">
        <span className="label">{t('I am')}</span>
        <div className="chips">
          {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
            <button key={g} type="button" className="chip" aria-pressed={gender === g} onClick={() => setGender(g)}>
              {t(GENDER_LABELS[g])}
            </button>
          ))}
        </div>
        <span className="small">{t("Shown next to your name so people know who they're chatting to.")}</span>
      </div>
      <div className="col">
        <span className="label">{t("I'm here for")}</span>
        <div className="chips">
          {(Object.keys(MODE_LABELS) as ChatMode[]).map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {t(MODE_LABELS[m])}
            </button>
          ))}
        </div>
        <span className="small">{t('Shown next to your name so nobody misreads your intent.')}</span>
      </div>
      <label className="check">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        <span>{t('I am 18 or over and agree to the house rules: be kind, take no for an answer.')}</span>
      </label>
      <div style={{ flex: 1 }} />
      {venue.offer_enabled && (
        <div className="card offer col">
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>{t("Tonight's welcome offer")}</span>
          <span className="display" style={{ fontSize: 22 }}>{venue.offer_text}</span>
          <label className="check">
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>{t('Yes, send me offers and events from {venue}. Optional; chatting works either way.', { venue: venue.venue_name })}</span>
          </label>
          {optIn && (
            <div className="col" style={{ gap: 6 }}>
              <span className="label">{t('Your birthday (optional)')}</span>
              <div className="row" style={{ gap: 8 }}>
                <select className="input" aria-label="Birthday day" value={bDay} onChange={(e) => setBDay(e.target.value)} style={{ flex: 1 }}>
                  <option value="">{t('Day')}</option>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
                <select className="input" aria-label="Birthday month" value={bMonth} onChange={(e) => setBMonth(e.target.value)} style={{ flex: 2 }}>
                  <option value="">{t('Month')}</option>
                  {monthNames(lang).map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <span className="small">{bdayOffer ? `${bdayOffer}. ` : ''}{t('No year needed.')}</span>
            </div>
          )}
        </div>
      )}
      <p className="small">
        {venue.kind === 'event'
          ? t("{venue} will see your name, email and when you checked in and which area you were in, so they can welcome you back. Your chats stay private: nobody but you and the person you're talking to can read them.", { venue: venue.venue_name })
          : t("{venue} will see your name, email and when you visited and where you sat, so they can welcome you back. Your chats stay private: nobody but you and the person you're talking to can read them.", { venue: venue.venue_name })}{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">{t('Privacy policy')}</a>
      </p>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? t('Entering…') : t('Enter the room')}
      </button>
    </form>
  );
}
