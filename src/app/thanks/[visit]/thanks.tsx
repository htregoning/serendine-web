'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Logo from '@/components/logo';

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
        <span className="small">{info.venue_name}</span>
      </div>

      {stage === 'rate' && (
        <>
          <h1 className="display">How was {isEvent ? 'it' : 'tonight'}?</h1>
          <p className="lede">One tap. It helps {info.venue_name} look after you next time.</p>
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
          <button className="link-quiet small" onClick={skip} disabled={busy}>Skip</button>
        </>
      )}

      {stage === 'comment' && (
        <>
          <h1 className="display">{happy ? 'So glad you enjoyed it.' : 'Thanks for being honest.'}</h1>
          {happy && google && (
            <div className="card col" style={{ gap: 10 }}>
              <strong>Would you share that on Google?</strong>
              <span className="small">Reviews make a real difference to {info.venue_name}. It takes a minute.</span>
              <a className="btn btn-primary" href={google} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                Leave a Google review
              </a>
            </div>
          )}
          <div className="col" style={{ gap: 8 }}>
            <label className="label" htmlFor="fb-comment">
              {happy ? 'Anything you’d like the team to know? (optional)' : `What could ${info.venue_name} do better?`}
            </label>
            <textarea
              id="fb-comment"
              className="input"
              rows={4}
              maxLength={1000}
              placeholder={happy ? 'Shout out a great server, a favourite dish…' : 'Only the manager sees this.'}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <span className="small">Goes privately to the manager with your name and table.</span>
          </div>
          <button className="btn btn-primary" onClick={sendComment} disabled={busy}>
            {comment.trim() ? 'Send to the manager' : 'Done'}
          </button>
          {!happy && google && (
            <a className="small" href={google} target="_blank" rel="noopener noreferrer">Or leave a public review on Google</a>
          )}
        </>
      )}

      {stage === 'done' && (
        <>
          <h1 className="display">Thank you.</h1>
          <p className="lede">{info.venue_name} will see your feedback. Hope to see you again soon.</p>
          {insta && (
            <div className="card col" style={{ gap: 8 }}>
              <strong>Posting tonight?</strong>
              <span className="small">Tag @{insta} and @serendiners in your story.</span>
              <a className="btn btn-ghost btn-sm" href={`https://instagram.com/${insta}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                Open @{insta} on Instagram
              </a>
            </div>
          )}
          {google && happy && (
            <a className="small" href={google} target="_blank" rel="noopener noreferrer">Leave a Google review</a>
          )}
          <a className="btn btn-ghost" href="/connections" style={{ textDecoration: 'none' }}>Your connections</a>
          <a className="small" href="/">Back to Serendine</a>
        </>
      )}
    </main>
  );
}
