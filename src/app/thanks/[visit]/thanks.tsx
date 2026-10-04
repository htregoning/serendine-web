'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Logo from '@/components/logo';
import { LangToggle, useT } from '@/components/lang';

export type FeedbackInfo = {
  venue_name: string;
  google_review_url: string | null;
  instagram_handle: string | null;
  table_label: string;
  kind: string | null;
  rated: boolean;
  rating: number | null;
};

const WORDS = ['', 'Not good', 'Could be better', 'OK', 'Good', 'Loved it'];

// "How was tonight?" Everyone can rate and is offered the Google review link (Google's rules
// don't allow asking only happy guests); unhappy guests are offered a private word with the manager first.
export default function Thanks({ visitId, info }: { visitId: string; info: FeedbackInfo }) {
  const [supabase] = useState(() => createClient());
  const [rating, setRating] = useState<number>(info.rating ?? 0);
  const [comment, setComment] = useState('');
  const [stage, setStage] = useState<'rate' | 'comment' | 'done'>(info.rated && info.rating ? 'done' : 'rate');
  const [busy, setBusy] = useState(false);
  const isEvent = info.kind === 'event';
  const t = useT();
  const venue = info.venue_name;

  async function save(r: number | null, c?: string) {
    setBusy(true);
    await supabase.rpc('submit_feedback', { p_visit: visitId, p_rating: r, p_comment: c ?? null });
    setBusy(false);
  }

  async function pick(r: number) {
    setRating(r);
    await save(r);
    setStage('comment');
  }

  async function sendComment() {
    if (comment.trim()) await save(rating, comment.trim());
    setStage('done');
  }

  async function skip() {
    await save(null);
    window.location.href = '/';
  }

  const happy = rating >= 4;
  const google = info.google_review_url;
  const insta = info.instagram_handle;

  return (
    <main className="shell" style={{ justifyContent: 'center', gap: 22 }}>
      <div className="row" style={{ gap: 12 }}>
        <Logo size={44} />
        <span className="small grow">{info.venue_name}</span>
        <LangToggle />
      </div>

      {stage === 'rate' && (
        <>
          <h1 className="display">{isEvent ? t('How was it?') : t('How was tonight?')}</h1>
          <p className="lede">{t('One tap. It helps {venue} look after you next time.', { venue })}</p>
          <div className="stars" role="radiogroup" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className="star"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? '' : 's'}: ${WORDS[n]}`}
                data-on={n <= rating}
                disabled={busy}
                onClick={() => pick(n)}
              >
                <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2 6.4 20.2l1.1-6.3L2.9 9.5l6.3-.9z" />
                </svg>
              </button>
            ))}
          </div>
          <button className="link-quiet small" onClick={skip} disabled={busy}>{t('Skip')}</button>
        </>
      )}

      {stage === 'comment' && (
        <>
          <h1 className="display">{happy ? t('So glad you enjoyed it.') : t('Thanks for being honest.')}</h1>
          {happy && google && (
            <div className="card col" style={{ gap: 10 }}>
              <strong>{t('Would you share that on Google?')}</strong>
              <span className="small">{t('Reviews make a real difference to {venue}. It takes a minute.', { venue })}</span>
              <a className="btn btn-primary" href={google} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                {t('Leave a Google review')}
              </a>
            </div>
          )}
          <div className="col" style={{ gap: 8 }}>
            <label className="label" htmlFor="fb-comment">
              {happy ? t('Anything you’d like the team to know? (optional)') : t('What could {venue} do better?', { venue })}
            </label>
            <textarea
              id="fb-comment"
              className="input"
              rows={4}
              maxLength={1000}
              placeholder={happy ? t('Shout out a great server, a favourite dish…') : t('Only the manager sees this.')}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <span className="small">{t('Goes privately to the manager with your name and table.')}</span>
          </div>
          <button className="btn btn-primary" onClick={sendComment} disabled={busy}>
            {comment.trim() ? t('Send to the manager') : t('Done')}
          </button>
          {!happy && google && (
            <a className="small" href={google} target="_blank" rel="noopener noreferrer">{t('Or leave a public review on Google')}</a>
          )}
        </>
      )}

      {stage === 'done' && (
        <>
          <h1 className="display">{t('Thank you.')}</h1>
          <p className="lede">{t('{venue} will see your feedback. Hope to see you again soon.', { venue })}</p>
          {insta && (
            <div className="card col" style={{ gap: 8 }}>
              <strong>{t('Posting tonight?')}</strong>
              <span className="small">{t('Tag @{insta} and @serendiners in your story.', { insta })}</span>
              <a className="btn btn-ghost btn-sm" href={`https://instagram.com/${insta}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                {t('Open @{insta} on Instagram', { insta })}
              </a>
            </div>
          )}
          {google && happy && (
            <a className="small" href={google} target="_blank" rel="noopener noreferrer">{t('Leave a Google review')}</a>
          )}
          <a className="btn btn-ghost" href="/connections" style={{ textDecoration: 'none' }}>{t('Your connections')}</a>
          <a className="small" href="/">{t('Back to Serendine')}</a>
        </>
      )}
    </main>
  );
}
