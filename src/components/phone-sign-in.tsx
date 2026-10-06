'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/components/lang';

// Which phone channels are switched on (set in Vercel once a text provider is connected in Supabase):
// NEXT_PUBLIC_PHONE_LOGIN = "sms", "whatsapp" or "both". Unset: phone sign-in stays hidden.
const SETTING = (process.env.NEXT_PUBLIC_PHONE_LOGIN ?? '').toLowerCase();
export const PHONE_CHANNELS: ('whatsapp' | 'sms')[] =
  SETTING === 'both' ? ['whatsapp', 'sms'] : SETTING === 'whatsapp' ? ['whatsapp'] : SETTING === 'sms' ? ['sms'] : [];
export const phoneLoginOn = PHONE_CHANNELS.length > 0;

// "050 123 4567", "+971 50…", "00971…" or "50 123 4567" → "+971501234567". Other countries need the + code.
export function normalisePhone(raw: string) {
  let p = raw.replace(/[\s\-().]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  else if (p.startsWith('0')) p = `+971${p.slice(1)}`;
  else if (/^5\d{8}$/.test(p)) p = `+971${p}`;
  return /^\+\d{8,15}$/.test(p) ? p : null;
}

// Sign in with a phone number and a 6-digit code sent by WhatsApp or text message.
export default function PhoneSignIn({ next, onBack }: { next: string; onBack?: () => void }) {
  const [supabase] = useState(() => createClient());
  const t = useT();
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>(PHONE_CHANNELS[0] ?? 'sms');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(via: 'whatsapp' | 'sms', e?: React.FormEvent) {
    e?.preventDefault();
    const number = normalisePhone(phone);
    if (!number) return setError(t('Enter your mobile number, e.g. 050 123 4567 or +44 7700 900123.'));
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: number, options: { channel: via } });
    setBusy(false);
    if (error) {
      const limited = error.status === 429 || /rate limit|too many/i.test(error.message);
      return setError(limited ? t('Too many codes asked for. Please wait a minute and try again.') : t('We could not send a code to that number. Check it and try again.'));
    }
    setChannel(via);
    setSentTo(number);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone: sentTo, token: code.trim(), type: 'sms' });
    if (error) {
      setBusy(false);
      return setError(t('That code did not work. Check it, or send a new one.'));
    }
    window.location.assign(next);
  }

  if (!sentTo) {
    return (
      <form className="col" style={{ gap: 8 }} onSubmit={(e) => send(PHONE_CHANNELS[0], e)}>
        <label className="label" htmlFor="si-phone" style={{ margin: 0 }}>{t('Your mobile number')}</label>
        <input
          id="si-phone"
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          placeholder="050 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {PHONE_CHANNELS.map((c, i) => (
            <button
              key={c}
              type={i === 0 ? 'submit' : 'button'}
              className={i === 0 ? 'btn btn-primary grow' : 'btn btn-ghost grow'}
              disabled={busy}
              onClick={i === 0 ? undefined : () => send(c)}
            >
              {c === 'whatsapp' ? t('Send code by WhatsApp') : t('Send code by text')}
            </button>
          ))}
        </div>
        {onBack && <button type="button" className="link-quiet small" onClick={onBack} style={{ alignSelf: 'center' }}>{t('Other ways to sign in')}</button>}
        {error && <p className="error" role="status" style={{ margin: 0 }}>{error}</p>}
      </form>
    );
  }

  return (
    <form className="col" style={{ gap: 8 }} onSubmit={verify}>
      <span className="small">
        {channel === 'whatsapp' ? t('We sent a 6-digit code to {n} on WhatsApp.', { n: sentTo }) : t('We sent a 6-digit code to {n} by text.', { n: sentTo })}
      </span>
      <div className="row" style={{ gap: 8 }}>
        <label htmlFor="si-code" style={{ position: 'absolute', left: -9999 }}>Code</label>
        <input
          id="si-code"
          className="input grow"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={8}
          autoFocus
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          style={{ letterSpacing: 4, fontSize: 20 }}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || code.length < 6}>{busy ? '…' : t('Sign in')}</button>
      </div>
      <div className="row" style={{ gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="link-quiet small" onClick={() => send(channel)} disabled={busy}>{t('Send a new code')}</button>
        {PHONE_CHANNELS.length > 1 && (
          <button type="button" className="link-quiet small" onClick={() => send(channel === 'whatsapp' ? 'sms' : 'whatsapp')} disabled={busy}>
            {channel === 'whatsapp' ? t('Send by text instead') : t('Send by WhatsApp instead')}
          </button>
        )}
        <button type="button" className="link-quiet small" onClick={() => { setSentTo(null); setCode(''); }}>{t('Change number')}</button>
      </div>
      {error && <p className="error" role="status" style={{ margin: 0 }}>{error}</p>}
    </form>
  );
}
