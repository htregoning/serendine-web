'use client';
import { useLang, useT } from '@/components/lang';
import { currentIcebreaker } from '@/lib/icebreakers';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/avatar';
import { genderTag } from '@/lib/types';
import { SendDrink } from '@/components/drinks';

type Client = ReturnType<typeof createClient>;

type Post = {
  id: number;
  visit_id: string;
  alias: string;
  gender: string;
  has_photo: boolean;
  body: string;
  created_at: string;
  mine: boolean;
  author_open: boolean;
};

type Props = {
  supabase: Client;
  venueId: string;
  onChatWith: (visitId: string) => void;
  onNote: (note: string) => void;
  onNewWhileAway?: () => void;
  drinksEnabled?: boolean;
};

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// The venue's group chat: everyone who is open can read and post.
export default function Lobby({ supabase, venueId, onChatWith, onNote, drinksEnabled = false }: Props) {
  const t = useT();
  const lang = useLang();
  const [ice, setIce] = useState(() => currentIcebreaker(lang));
  useEffect(() => {
    setIce(currentIcebreaker(lang));
    const id = setInterval(() => setIce(currentIcebreaker(lang)), 60000);
    return () => clearInterval(id);
  }, [lang]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<Post | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('lobby_feed', { v: venueId });
    const list = (data as Post[] | null) ?? [];
    setPosts(list);
  }, [supabase, venueId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`lobby-${venueId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'venue_messages', filter: `venue_id=eq.${venueId}` }, () =>
        load(),
      )
      .subscribe();
    const poll = setInterval(load, 6000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [supabase, venueId, load]);

  useEffect(() => {
    const newest = posts.length ? posts[posts.length - 1].id : 0;
    if (newest > lastId.current) bottom.current?.scrollIntoView({ block: 'end' });
    lastId.current = newest;
  }, [posts]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setError(null);
    setDraft('');
    const { error } = await supabase.rpc('post_to_lobby', { p_body: text });
    if (error) {
      setDraft(text);
      setError(error.message.includes('Slow down') ? t('Slow down a little, then try again.') : t('That did not send. Please try again.'));
      return;
    }
    load();
  }

  async function block(report: boolean) {
    if (!menu) return;
    const { error } = await supabase.rpc('block_from_lobby', {
      p_visit: menu.visit_id,
      p_report: report,
      p_reason: report ? reason.trim() || null : null,
      p_message: report ? menu.id : null,
    });
    if (error) return setError(t('That did not work. Please try again.'));
    onNote(
      report
        ? `${menu.alias} is blocked and reported. Thank you for telling us.`
        : `${menu.alias} is blocked. You won't see each other any more, and they aren't told.`,
    );
    setMenu(null);
    setReporting(false);
    setReason('');
    load();
  }

  return (
    <div className="col" style={{ gap: 10 }}>
      <p className="small" style={{ margin: 0 }}>
        {t('Everyone who is open to chat here can read the group. Private chats stay encrypted. Group messages are cleared after the night.')}
      </p>

      <div className="icebreaker">
        <span className="eyebrow">{t('Tonight’s icebreaker')}</span>
        <strong>{ice}</strong>
        <button className="btn btn-ghost btn-sm" onClick={() => setDraft(ice + ' ')} style={{ alignSelf: 'flex-start' }}>
          {t('Answer in the group')}
        </button>
      </div>

      <div className="lobby-feed">
        {posts.length === 0 && (
          <p className="small" style={{ textAlign: 'center', margin: 'auto 12px' }}>
            {t('Nobody has said anything yet. Break the ice: say hello to the room.')}
          </p>
        )}
        {posts.map((p) => {
          const tag = genderTag(p.gender);
          return (
            <div key={p.id} className={p.mine ? 'lobby-post mine' : 'lobby-post'}>
              {!p.mine && (
                <button className="lobby-who" onClick={() => setMenu(p)} aria-label={`Options for ${p.alias}`}>
                  <Avatar supabase={supabase} visitId={p.visit_id} alias={p.alias} hasPhoto={p.has_photo} size={34} />
                </button>
              )}
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                {!p.mine && (
                  <button className="lobby-name" onClick={() => setMenu(p)}>
                    {p.alias}
                    {tag && <span className="small"> · {tag}</span>}
                  </button>
                )}
                <div className={p.mine ? 'bubble mine' : 'bubble theirs'} style={{ maxWidth: '100%' }}>{p.body}</div>
                <span className="small" style={{ fontSize: 11, alignSelf: p.mine ? 'flex-end' : 'flex-start' }}>{time(p.created_at)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {menu && (
        <div className="card col" role="dialog" aria-label={`Options for ${menu.alias}`}>
          <div className="row">
            <Avatar supabase={supabase} visitId={menu.visit_id} alias={menu.alias} hasPhoto={menu.has_photo} size={48} />
            <div className="col grow" style={{ gap: 2 }}>
              <strong>{menu.alias}</strong>
              {genderTag(menu.gender) && <span className="small">{genderTag(menu.gender)}</span>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setMenu(null); setReporting(false); }}>{t('Close')}</button>
          </div>
          {!reporting ? (
            <>
              {menu.author_open ? (
                <button className="btn btn-primary btn-sm" onClick={() => { onChatWith(menu.visit_id); setMenu(null); }}>
                  Chat privately
                </button>
              ) : null}
              {menu.author_open && drinksEnabled && (
                <SendDrink
                  supabase={supabase}
                  toVisit={menu.visit_id}
                  toAlias={menu.alias}
                  onDone={(m) => {
                    onNote(m);
                    setMenu(null);
                  }}
                />
              )}
              {!menu.author_open && (
                <span className="small">{menu.alias} has left or switched off chat.</span>
              )}
              <div className="row" style={{ justifyContent: 'center', gap: 4 }}>
                <button className="link-danger" onClick={() => block(false)}>{t('Block')}</button>
                <span className="small">·</span>
                <button className="link-danger" onClick={() => setReporting(true)}>{t('Report')}</button>
              </div>
            </>
          ) : (
            <>
              <span className="small">{t("We'll block them for you and send this message with your report.")}</span>
              <label className="label" htmlFor="lobby-reason">{t('What happened? (optional)')}</label>
              <textarea id="lobby-reason" className="input" style={{ height: 72, paddingTop: 10 }} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={() => block(true)}>{t('Block & report')}</button>
            </>
          )}
        </div>
      )}

      {error && <p className="error" role="status">{error}</p>}
      <form className="row" style={{ gap: 10 }} onSubmit={post}>
        <label htmlFor="lobby-draft" style={{ position: 'absolute', left: -9999 }}>{t('Message the room')}</label>
        <input
          id="lobby-draft"
          className="input grow"
          style={{ borderRadius: 24, height: 48 }}
          placeholder={t('Say something to the room…')}
          maxLength={500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
        />
        <button className="btn btn-primary" style={{ width: 48, height: 48, padding: 0 }} type="submit" aria-label={t('Send')}>›</button>
      </form>
    </div>
  );
}
