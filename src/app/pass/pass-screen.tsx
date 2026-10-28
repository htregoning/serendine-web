'use client';

import { useCallback, useEffect, useState } from 'react';
import { toString as qrSvg } from 'qrcode';
import { createClient } from '@/lib/supabase/client';
import LoyaltyCards from '@/components/loyalty-cards';
import { useT } from '@/components/lang';

export const formatPass = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

// The pass: a big QR (opens the staff page for this guest), the typed code, and the guest's cards.
export default function PassScreen() {
  const t = useT();
  const [supabase] = useState(() => createClient());
  const [code, setCode] = useState<string | null>(null);
  const [svg, setSvg] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmRenew, setConfirmRenew] = useState(false);

  const load = useCallback(
    async (renew = false) => {
      const { data, error } = await supabase.rpc('my_pass', { p_renew: renew });
      if (error || !data) return setProblem(error?.code === 'PGRST202' ? t('Passes arrive with the next update.') : t('Your pass could not be loaded. Please try again.'));
      const c = data as string;
      setCode(c);
      setSvg(await qrSvg(`${window.location.origin}/s/${c}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B1A3A', light: '#FFFFFF' } }));
    },
    [supabase, t],
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="shell">
      <a className="small" href="/me" style={{ alignSelf: 'flex-start' }}>‹ {t('Your places and plans')}</a>
      <div className="col" style={{ gap: 6 }}>
        <h1 className="display" style={{ fontSize: 30, margin: 0 }}>{t('Your loyalty pass')}</h1>
        <p className="small" style={{ margin: 0 }}>{t('Show this at the counter. Staff scan it to add your stamps and give you rewards.')}</p>
      </div>
      {problem && <p className="card small">{problem}</p>}
      {code && (
        <div className="pass-card">
          <div className="pass-qr" dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label={t('Your pass QR code')} />
          <span className="pass-code" aria-label={t('Pass code')}>{formatPass(code)}</span>
          <span className="pass-hint">{t('Turn your screen brightness up if it won’t scan.')}</span>
        </div>
      )}
      <LoyaltyCards supabase={supabase} showVenue live />
      <div style={{ flex: 1 }} />
      {code &&
        (confirmRenew ? (
          <div className="card col" style={{ gap: 8 }}>
            <span className="small">{t('Get a new code if you think someone else has a copy of your pass. Your stamps and rewards stay as they are.')}</span>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setConfirmRenew(false); load(true); }}>{t('Get a new code')}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRenew(false)}>{t('Cancel')}</button>
            </div>
          </div>
        ) : (
          <button className="link-quiet small" style={{ alignSelf: 'center' }} onClick={() => setConfirmRenew(true)}>{t('New pass code')}</button>
        ))}
    </main>
  );
}
