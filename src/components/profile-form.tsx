'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/components/lang';
import { normalisePhone } from '@/components/phone-sign-in';
import { GENDER_LABELS, type Gender } from '@/lib/types';

export type MyProfile = {
  full_name: string | null;
  email: string | null;
  email_locked: boolean;
  phone: string | null;
  birth_date: string | null;
  sex: Gender | null;
  marketing_ok: boolean;
  last_alias: string | null;
  complete: boolean;
};

// Loads the signed-in guest's profile. null = still loading; undefined = before database update 0031.
export function useMyProfile() {
  const [supabase] = useState(() => createClient());
  const [profile, setProfile] = useState<MyProfile | null | undefined>(null);
  useEffect(() => {
    supabase.rpc('my_profile').then(({ data, error }: { data: MyProfile[] | null; error: unknown }) => {
      setProfile(error ? undefined : ((data ?? [])[0] ?? undefined));
    });
  }, [supabase]);
  return [profile, setProfile] as const;
}

function eighteenYearsAgo() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
}

// Name, email, mobile, date of birth and sex, asked once and saved. Never shown to other guests.
export default function ProfileForm({
  initial,
  onSaved,
  title,
  lede,
  submitLabel,
}: {
  initial: MyProfile;
  onSaved: (p: MyProfile) => void;
  title?: string;
  lede?: string;
  submitLabel?: string;
}) {
  const t = useT();
  const [supabase] = useState(() => createClient());
  const [name, setName] = useState(initial.full_name ?? '');
  const [email, setEmail] = useState(initial.email ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [dob, setDob] = useState(initial.birth_date ?? '');
  const [sex, setSex] = useState<Gender | ''>(initial.sex ?? '');
  const [marketing, setMarketing] = useState(initial.marketing_ok);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const number = normalisePhone(phone);
    if (name.trim().length < 2) return setError(t('Add your name.'));
    if (!initial.email_locked && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError(t('Add your email address.'));
    if (!number) return setError(t('Add your mobile number, e.g. 050 123 4567 or +44 7700 900123.'));
    if (!dob) return setError(t('Add your date of birth.'));
    if (dob > eighteenYearsAgo()) return setError(t('Serendine is for over-18s only.'));
    if (!sex) return setError(t('Choose an option for sex.'));
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('save_my_profile', {
      p_name: name.trim(),
      p_email: initial.email_locked ? null : email.trim(),
      p_phone: number,
      p_birth_date: dob,
      p_sex: sex,
      p_marketing: marketing,
    });
    setBusy(false);
    if (error) return setError(error.message);
    onSaved({ ...initial, full_name: name.trim(), email: initial.email_locked ? initial.email : email.trim(), phone: number, birth_date: dob, sex, marketing_ok: marketing, complete: true });
  }

  return (
    <form className="col profile-form" style={{ gap: 16 }} onSubmit={save}>
      {(title || lede) && (
        <div className="col" style={{ gap: 6 }}>
          {title && <h1 className="display" style={{ fontSize: 28, margin: 0 }}>{title}</h1>}
          {lede && <p className="lede" style={{ margin: 0 }}>{lede}</p>}
        </div>
      )}
      <div className="col">
        <label className="label" htmlFor="pf-name">{t('Your name')}</label>
        <input id="pf-name" className="input" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="col">
        <label className="label" htmlFor="pf-email">{t('Email')}</label>
        <input
          id="pf-email"
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          readOnly={initial.email_locked}
          onChange={(e) => setEmail(e.target.value)}
          style={initial.email_locked ? { opacity: 0.7 } : undefined}
        />
      </div>
      <div className="col">
        <label className="label" htmlFor="pf-phone">{t('Mobile number')}</label>
        <input id="pf-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="050 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="col" style={{ minWidth: 170 }}>
          <label className="label" htmlFor="pf-dob">{t('Date of birth')}</label>
          <input id="pf-dob" className="input" type="date" max={eighteenYearsAgo()} min="1900-01-01" autoComplete="bday" value={dob} onChange={(e) => setDob(e.target.value)} />
        </div>
      </div>
      <div className="col">
        <span className="label">{t('Sex')}</span>
        <div className="chips">
          {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
            <button key={g} type="button" className="chip" aria-pressed={sex === g} onClick={() => setSex(g)}>{t(GENDER_LABELS[g])}</button>
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
        <span>
          {t('Send me offers and birthday treats from venues I visit.')}{' '}
          <span style={{ color: 'var(--muted)' }}>{t('Optional. Turn it off any time.')}</span>
        </span>
      </label>
      <p className="small" style={{ margin: 0 }}>
        {t('Never shown to other guests. Venues you visit see your name, email, mobile and visits; they only get your birthday (not the year) if you tick offers.')}{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">{t('Privacy policy')}</a>
      </p>
      {error && <p className="error" role="status" style={{ margin: 0 }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('Saving…') : submitLabel ?? t('Save')}</button>
    </form>
  );
}
