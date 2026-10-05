'use client';

import { useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/avatar';
import { LangToggle, useLang, useT } from '@/components/lang';
import { monthNames } from '@/lib/i18n';
import { GENDER_LABELS, MODE_LABELS, type ChatMode, type Gender, type VenueAtTable } from '@/lib/types';

type Client = ReturnType<typeof createClient>;
export type MyExtras = { mode: ChatMode; gender: string; optedIn: boolean };

type Props = {
  supabase: Client;
  venue: VenueAtTable;
  visitId: string;
  alias: string;
  current: MyExtras;
  hasPhoto: boolean;
  photoVersion: number;
  photoBusy: boolean;
  onPhoto: (f: File) => void;
  onRemovePhoto: () => void;
  onClose: () => void;
  onSaved: (next: MyExtras) => void;
};

// "Make tonight yours": the optional details, asked once after check-in and changeable any time.
export default function Extras({ supabase, venue, visitId, alias, current, hasPhoto, photoVersion, photoBusy, onPhoto, onRemovePhoto, onClose, onSaved }: Props) {
  const t = useT();
  const lang = useLang();
  const modes = (Object.keys(MODE_LABELS) as ChatMode[]).filter((m) => !venue.allowed_modes || venue.allowed_modes.includes(m));
  const [mode, setMode] = useState<ChatMode>(current.mode);
  const [gender, setGender] = useState<string>(current.gender);
  const [optIn, setOptIn] = useState(current.optedIn);
  const [bDay, setBDay] = useState('');
  const [bMonth, setBMonth] = useState('');
  const [bdayOffer, setBdayOffer] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('venues')
      .select('birthday_offer')
      .eq('id', venue.venue_id)
      .maybeSingle()
      .then(({ data }: { data: { birthday_offer?: string | null } | null }) => setBdayOffer(data?.birthday_offer ?? null));
    supabase
      .from('visits')
      .select('mute_venue')
      .eq('id', visitId)
      .maybeSingle()
      .then(({ data }: { data: { mute_venue?: boolean } | null }) => setMuted(!!data?.mute_venue));
    supabase.rpc('my_birthday').then(({ data }: { data: { birth_day: number | null; birth_month: number | null }[] | null }) => {
      const b = data?.[0];
      if (b?.birth_day && b?.birth_month) {
        setBDay(String(b.birth_day));
        setBMonth(String(b.birth_month));
      }
    });
  }, [supabase, venue.venue_id, visitId]);

  // Close with the Escape key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('update_my_visit', {
      p_mode: mode,
      p_gender: gender,
      p_opt_in: venue.offer_enabled ? optIn : null,
    });
    if (error) {
      setBusy(false);
      return setError(
        error.code === 'PGRST202'
          ? t('This needs a quick update from the venue first. Please try again later.')
          : /not available/.test(error.message)
            ? t('That chat mode is not available here.')
            : t('That did not save. Please try again.'),
      );
    }
    if (optIn && bDay && bMonth) await supabase.rpc('set_my_birthday', { p_day: Number(bDay), p_month: Number(bMonth) });
    setBusy(false);
    onSaved({ mode, gender, optedIn: venue.offer_enabled ? optIn : current.optedIn });
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="extras-title" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="col" style={{ gap: 4 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="extras-title" className="display" style={{ margin: 0, fontSize: 24 }}>{t('Make tonight yours')}</h2>
            <LangToggle />
          </div>
          <span className="small">{t('All optional. Change any of it later by tapping your name at the top.')}</span>
        </div>

        {modes.length > 1 && (
          <div className="col">
            <span className="label">{t("I'm here for")}</span>
            <div className="chips">
              {modes.map((m) => (
                <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>
                  {t(MODE_LABELS[m])}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="col">
          <span className="label">{t('I am')}</span>
          <div className="chips">
            {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
              <button key={g} type="button" className="chip" aria-pressed={gender === g} onClick={() => setGender(g)}>
                {t(GENDER_LABELS[g])}
              </button>
            ))}
          </div>
        </div>

        <div className="row extras-photo">
          <Avatar supabase={supabase} visitId={visitId} alias={alias} hasPhoto={hasPhoto} size={48} version={photoVersion} />
          <div className="col grow" style={{ gap: 2 }}>
            <strong style={{ fontSize: 14 }}>{hasPhoto ? t('Your photo') : t('Add a selfie')}</strong>
            <span className="small" style={{ fontSize: 12 }}>{t('Shown only to people open to chat here tonight. Deleted when you leave.')}</span>
          </div>
          <div className="col" style={{ gap: 4, alignItems: 'flex-end' }}>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              {photoBusy ? t('Saving…') : hasPhoto ? t('Retake') : t('Take selfie')}
              <input
                type="file"
                accept="image/*"
                capture="user"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPhoto(f);
                  e.target.value = '';
                }}
              />
            </label>
            {hasPhoto && <button className="link-danger" style={{ minHeight: 28 }} onClick={onRemovePhoto}>{t('Remove')}</button>}
          </div>
        </div>

        {venue.offer_enabled && (
          <div className="col" style={{ gap: 10 }}>
            <label className="check">
              <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
              <span>
                {t("Get tonight's offer ({offer}) and hear about {venue}'s events.", { offer: venue.offer_text, venue: venue.venue_name })}{' '}
                <span style={{ color: 'var(--muted)' }}>{t('Unsubscribe any time.')}</span>
              </span>
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

        <label className="check">
          <input
            type="checkbox"
            checked={!muted}
            onChange={async (e) => {
              const next = !e.target.checked;
              setMuted(next);
              await supabase.rpc('set_venue_mute', { p_mute: next });
            }}
          />
          <span>{t('Notifications from {venue}', { venue: venue.venue_name })}</span>
        </label>

        {error && <p className="error" role="status" style={{ margin: 0 }}>{error}</p>}
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-ghost grow" onClick={onClose}>{t('Not now')}</button>
          <button className="btn btn-primary grow" style={{ flexGrow: 1.4 }} onClick={save} disabled={busy}>{busy ? t('Saving…') : t('Done')}</button>
        </div>
      </div>
    </div>
  );
}
