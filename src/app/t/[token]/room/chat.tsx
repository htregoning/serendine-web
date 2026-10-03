'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { createKeyPair, decryptText, encryptText, loadKeyPair, saveKeyPair, sharedKey } from '@/lib/crypto';
import { MODE_LABELS, type ChatMode } from '@/lib/types';

export type Conv = {
  conversation_id: string;
  partner_visit: string;
  partner_alias: string;
  partner_mode: ChatMode;
  partner_zone: string;
  partner_key: string | null;
  i_share: boolean;
  they_share: boolean;
  i_keep: boolean;
  they_keep: boolean;
  last_at: string;
};

type Row = { id: number; sender_visit: string; ciphertext: string; iv: string; created_at: string };
type Msg = { id: number; mine: boolean; text: string };

type Props = {
  supabase: ReturnType<typeof createClient>;
  conv: Conv;
  myVisitId: string;
  myTable: string;
  onBack: () => void;
  onChanged: () => void;
  onRemoved: (note: string) => void;
};

export default function Chat({ supabase, conv, myVisitId, myTable, onBack, onChanged, onRemoved }: Props) {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [keyProblem, setKeyProblem] = useState(false);
  const [keyVersion, setKeyVersion] = useState(0);
  const [moving, setMoving] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [theirTable, setTheirTable] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'block' | 'report'>('none');
  const [reason, setReason] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const c = conv.conversation_id;

  // Derive the shared secret on this phone from my private key and their public key.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const pair = await loadKeyPair(myVisitId);
        if (!pair || !conv.partner_key) throw new Error('no key');
        const k = await sharedKey(pair, conv.partner_key);
        if (live) {
          setKey(k);
          setKeyProblem(false);
        }
      } catch {
        if (live) setKeyProblem(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [myVisitId, conv.partner_key, keyVersion]);

  const decryptRow = useCallback(
    async (r: Row): Promise<Msg> => {
      let text = "This message can't be read on this device.";
      if (key) {
        try {
          text = await decryptText(key, r.ciphertext, r.iv);
        } catch {
          // keep the fallback text
        }
      }
      return { id: r.id, mine: r.sender_visit === myVisitId, text };
    },
    [key, myVisitId],
  );

  // Load the history, then receive new messages live.
  useEffect(() => {
    if (!key && !keyProblem) return;
    let live = true;
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, sender_visit, ciphertext, iv, created_at')
        .eq('conversation_id', c)
        .order('id', { ascending: true });
      const rows = (data as Row[] | null) ?? [];
      const out = await Promise.all(rows.map(decryptRow));
      if (live) setMessages(out);
    })();
    const channel = supabase
      .channel(`chat-${c}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${c}` },
        async (payload) => {
          const m = await decryptRow(payload.new as Row);
          setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
        },
      )
      .subscribe();
    return () => {
      live = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, c, key, keyProblem, decryptRow]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // When both agree to share tables, look up theirs.
  useEffect(() => {
    if (!(conv.i_share && conv.they_share)) {
      setTheirTable(null);
      return;
    }
    supabase.rpc('shared_table', { c }).then(({ data }) => setTheirTable((data as string | null) ?? null));
  }, [supabase, c, conv.i_share, conv.they_share]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !key) return;
    setError(null);
    setDraft('');
    const { ciphertext, iv } = await encryptText(key, text.slice(0, 1000));
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: c, sender_visit: myVisitId, ciphertext, iv })
      .select('id, sender_visit, ciphertext, iv, created_at')
      .single();
    if (error) {
      setDraft(text);
      setError(error.message.includes('Slow down') ? 'Slow down a little, then try again.' : 'That did not send. Please try again.');
      return;
    }
    const m: Msg = { id: (data as Row).id, mine: true, text };
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  }

  // Move chat to this device: make a new key here and publish its public half.
  // Messages sent before the move stay readable only on the old device.
  async function useThisDevice() {
    setMoving(true);
    try {
      const { pair, publicJwk } = await createKeyPair();
      const { error } = await supabase.from('visits').update({ public_key: publicJwk }).eq('id', myVisitId);
      if (error) throw error;
      await saveKeyPair(myVisitId, pair);
      setKeyVersion((v) => v + 1);
      onChanged();
    } catch {
      setError('Could not switch to this device. Please try again.');
    }
    setMoving(false);
  }

  async function setFlag(flag: 'share' | 'keep', val: boolean) {
    const { error } = await supabase.rpc('set_conversation_flag', { c, flag, val });
    if (error) setError('That did not save. Please try again.');
    onChanged();
  }

  async function block(report: boolean) {
    const evidence = report ? messages.slice(-30).map((m) => ({ from: m.mine ? 'me' : 'them', text: m.text })) : null;
    const { error } = await supabase.rpc('block_partner', {
      c,
      p_report: report,
      p_reason: report ? reason.trim() || null : null,
      p_evidence: evidence,
    });
    if (error) return setError('That did not work. Please try again.');
    onRemoved(
      report
        ? `${conv.partner_alias} is blocked and reported. Thank you for telling us.`
        : `${conv.partner_alias} is blocked. They can't see or message you, and they aren't told.`,
    );
  }

  const shareStatus =
    conv.i_share && conv.they_share
      ? `Tables shared. ${conv.partner_alias} is at Table ${theirTable ?? '…'}. You're at Table ${myTable}.`
      : conv.i_share
        ? `You offered to share tables. Nothing is revealed until ${conv.partner_alias} agrees.`
        : conv.they_share
          ? `${conv.partner_alias} would like to share tables.`
          : null;

  const keepStatus =
    conv.i_keep && conv.they_keep
      ? 'Connected. This chat stays after you both leave.'
      : conv.i_keep
        ? `You asked to keep in touch. Waiting for ${conv.partner_alias}.`
        : conv.they_keep
          ? `${conv.partner_alias} would like to keep in touch after tonight.`
          : null;

  return (
    <main className="chat">
      <header className="row chat-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back to the room">‹</button>
        <div className="avatar">{conv.partner_alias.charAt(0).toUpperCase()}</div>
        <div className="col grow" style={{ gap: 2 }}>
          <strong>{conv.partner_alias}</strong>
          <span className="small">{MODE_LABELS[conv.partner_mode]} · {conv.partner_zone}</span>
        </div>
        <span className="row small" style={{ gap: 4 }} title="End-to-end encrypted">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Encrypted
        </span>
      </header>

      <div className="col" style={{ gap: 8, padding: '12px 16px 0' }}>
        {shareStatus && <p className="card small chat-status">{shareStatus}</p>}
        {keepStatus && <p className="card small chat-status">{keepStatus}</p>}
        <div className="row" style={{ gap: 8 }}>
          {!conv.i_share && (
            <button className="btn btn-ghost btn-sm grow" onClick={() => setFlag('share', true)}>
              {conv.they_share ? 'Share tables' : 'Offer to share tables'}
            </button>
          )}
          {!conv.i_keep && (
            <button className="btn btn-ghost btn-sm grow" onClick={() => setFlag('keep', true)}>
              {conv.they_keep ? 'Keep in touch' : 'Ask to keep in touch'}
            </button>
          )}
        </div>
      </div>

      <div className="chat-scroll">
        {keyProblem && (
          <div className="card col" style={{ alignItems: 'center', textAlign: 'center' }}>
            <span className="small">
              You checked in on another device, so these messages can only be read there. You can move chat to this
              device instead: new messages will appear here, and the other device will stop receiving them.
            </span>
            <button className="btn btn-primary btn-sm" onClick={useThisDevice} disabled={moving}>
              {moving ? 'Switching…' : 'Use chat on this device'}
            </button>
          </div>
        )}
        {messages.length === 0 && !keyProblem && (
          <p className="small" style={{ textAlign: 'center', margin: 'auto 12px' }}>
            Start with something easy: ask about their order, or what brings them here tonight.
            Messages are encrypted; only the two of you can read them.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.mine ? 'bubble mine' : 'bubble theirs'}>{m.text}</div>
        ))}
        <div ref={bottom} />
      </div>

      <footer className="col chat-foot">
        {error && <p className="error" role="status">{error}</p>}
        {panel === 'none' && (
          <>
            <form className="row" style={{ gap: 10 }} onSubmit={send}>
              <label htmlFor="draft" style={{ position: 'absolute', left: -9999 }}>Message</label>
              <input
                id="draft"
                className="input grow"
                style={{ borderRadius: 24, height: 48 }}
                placeholder="Say hello…"
                maxLength={1000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!key}
                autoComplete="off"
              />
              <button className="btn btn-primary" style={{ width: 48, height: 48, padding: 0 }} type="submit" aria-label="Send" disabled={!key}>
                ›
              </button>
            </form>
            <div className="row" style={{ justifyContent: 'center', gap: 4 }}>
              <button className="link-danger" onClick={() => setPanel('block')}>Ignore &amp; block</button>
              <span className="small">·</span>
              <button className="link-danger" onClick={() => setPanel('report')}>Report</button>
            </div>
          </>
        )}
        {panel === 'block' && (
          <div className="card col">
            <strong>Block {conv.partner_alias}?</strong>
            <span className="small">They won&apos;t be able to see or message you again, and they won&apos;t be told.</span>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost btn-sm grow" onClick={() => setPanel('none')}>Cancel</button>
              <button className="btn btn-primary btn-sm grow" onClick={() => block(false)}>Block</button>
            </div>
          </div>
        )}
        {panel === 'report' && (
          <div className="card col">
            <strong>Report {conv.partner_alias}</strong>
            <span className="small">
              We&apos;ll block them for you. Your recent messages in this chat are sent with the report so we can review it.
            </span>
            <label className="label" htmlFor="reason">What happened? (optional)</label>
            <textarea id="reason" className="input" style={{ height: 80, paddingTop: 10 }} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost btn-sm grow" onClick={() => setPanel('none')}>Cancel</button>
              <button className="btn btn-primary btn-sm grow" onClick={() => block(true)}>Block &amp; report</button>
            </div>
          </div>
        )}
      </footer>
    </main>
  );
}
