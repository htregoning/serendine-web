'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createKeyPair, saveKeyPair } from '@/lib/crypto';
import { MODE_LABELS, type ChatMode, type VenueAtTable } from '@/lib/types';

type Props = { token: string; venue: VenueAtTable; signedIn: boolean };

export default function Welcome({ token, venue, signedIn }: Props) {
  const style = { '--accent': venue.accent } as React.CSSProperties;
  return (
    <main className="shell" style={style}>
      <div className="row">
        <div className="avatar" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
          {venue.venue_name.trim().charAt(0).toUpperCase()}
        </div>
        <div className="col" style={{ gap: 2 }}>
          <strong>{venue.venue_name}</strong>
          <span className="small">Checked in at Table {venue.table_label}</span>
        </div>
      </div>
      {signedIn ? <Profile token={token} venue={venue} /> : <SignIn token={token} />}
    </main>
  );
}

function SignIn({ token }: { token: string }) {
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectTo = () => `${window.location.origin}/auth/callback?next=/t/${token}`;

  async function oauth(provider: 'google' | 'apple') {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
    if (error) setError('Sign-in did not work. Please try again.');
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) setError('We could not send the link. Check the address and try again.');
    else setSent(true);
  }

  return (
    <>
      <h1 className="display">Someone in this room might be worth meeting.</h1>
      <p className="lede">
        Say hello to another table, as yourself or by an alias. Nobody sees you until you choose to be seen.
      </p>
      <div style={{ flex: 1 }} />
      <button className="btn btn-light" onClick={() => oauth('apple')}>Continue with Apple</button>
      <button className="btn btn-light" onClick={() => oauth('google')}>Continue with Google</button>
      <div className="divider">or</div>
      {sent ? (
        <p className="card small">Check your email for a sign-in link. Open it on this phone.</p>
      ) : (
        <form className="row" onSubmit={emailLink}>
          <label htmlFor="email" className="sr-only" style={{ position: 'absolute', left: -9999 }}>Email</label>
          <input
            id="email"
            className="input grow"
            type="email"
            required
            placeholder="Use email instead"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn btn-ghost" type="submit">Send link</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <p className="small" style={{ textAlign: 'center' }}>18+ only. Your email is never shown to other guests.</p>
    </>
  );
}

function Profile({ token, venue }: { token: string; venue: VenueAtTable }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [alias, setAlias] = useState('');
  const [mode, setMode] = useState<ChatMode>('friendly');
  const [adult, setAdult] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter(e: React.FormEvent) {
    e.preventDefault();
    if (!alias.trim()) return setError('Add a name or alias so people know who they are talking to.');
    if (!adult) return setError('Please confirm you are 18 or over.');
    setBusy(true);
    setError(null);
    try {
      const { pair, publicJwk } = await createKeyPair();
      const { data: visitId, error } = await supabase.rpc('start_visit', {
        token,
        p_alias: alias.trim(),
        p_mode: mode,
        p_opt_in: venue.offer_enabled ? optIn : false,
        p_public_key: publicJwk,
      });
      if (error || !visitId) throw error ?? new Error('no visit');
      await saveKeyPair(visitId as string, pair);
      router.replace(`/t/${token}/room`);
    } catch {
      setError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <form className="col" style={{ gap: 20, flex: 1 }} onSubmit={enter}>
      <h1 className="display">How should people know you tonight?</h1>
      <div className="col">
        <label className="label" htmlFor="alias">Name or alias</label>
        <input
          id="alias"
          className="input"
          maxLength={30}
          placeholder="e.g. Harry, or Blue Jumper"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
        />
      </div>
      <div className="col">
        <span className="label">I&apos;m here for</span>
        <div className="chips">
          {(Object.keys(MODE_LABELS) as ChatMode[]).map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <span className="small">Shown next to your name so nobody misreads your intent.</span>
      </div>
      <label className="check">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        <span>I am 18 or over and agree to the house rules: be kind, take no for an answer.</span>
      </label>
      <div style={{ flex: 1 }} />
      {venue.offer_enabled && (
        <div className="card offer col">
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>Tonight&apos;s welcome offer</span>
          <span className="display" style={{ fontSize: 22 }}>{venue.offer_text}</span>
          <label className="check">
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>Yes, send me offers and events from {venue.venue_name}. Optional; chatting works either way.</span>
          </label>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Entering…' : 'Enter the room'}
      </button>
    </form>
  );
}
