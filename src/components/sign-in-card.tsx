'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/components/lang';
import PhoneSignIn, { phoneLoginOn } from '@/components/phone-sign-in';

// Sign in with Google or an email link, then come back to `next`.
export default function SignInCard({ next, title, lede }: { next: string; title: string; lede?: string }) {
  const [supabase] = useState(() => createClient());
  const t = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
    if (error) setError(t('Sign-in did not work. Please try again.'));
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    if (error) setError(t('We could not send the link. Check the address and try again.'));
    else setSent(true);
  }

  return (
    <div className="col" style={{ gap: 10 }}>
      <strong>{title}</strong>
      {lede && <span className="small">{lede}</span>}
      {showPhone ? (
        <PhoneSignIn next={next} onBack={() => setShowPhone(false)} />
      ) : (
        <>
      <button className="btn btn-light" onClick={google}>{t('Continue with Google')}</button>
      {phoneLoginOn && !sent && !showEmail && (
        <button className="btn btn-ghost" onClick={() => setShowPhone(true)}>{t('Use my phone number')}</button>
      )}
      {sent ? (
        <p className="card small" role="status">{t('Check your email for a sign-in link. Open it on this phone.')}</p>
      ) : showEmail ? (
        <form className="row" onSubmit={emailLink}>
          <label htmlFor="si-email" style={{ position: 'absolute', left: -9999 }}>Email</label>
          <input id="si-email" className="input grow" type="email" required autoFocus placeholder={t('Your email address')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-ghost" type="submit">{t('Send link')}</button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => setShowEmail(true)}>{t('Use my email instead')}</button>
      )}
        </>
      )}
      {error && <p className="error" role="status">{error}</p>}
      <p className="small" style={{ margin: 0, textAlign: 'center' }}>
        {t('18+ only. By continuing you agree to the')} <a href="/terms">{t('terms')}</a> {t('and')} <a href="/privacy">{t('privacy policy')}</a>.
      </p>
    </div>
  );
}
