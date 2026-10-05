'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { notify } from '@/lib/push';
import Linkify from '@/components/linkify';

type Client = ReturnType<typeof createClient>;
type Msg = { id: string; name: string; body: string; created_at: string; mine: boolean; is_organiser: boolean };

function stamp(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

// Replies on a plan: everyone who has answered can talk it through here instead of a separate WhatsApp group.
export default function PlanReplies({ supabase, code, canDelete }: { supabase: Client; code: string; canDelete: boolean }) {
  const [list, setList] = useState<Msg[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(0);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('plan_messages', { p_code: code });
    if (error) return setList(null); // before update 0027
    const rows = (data as Msg[] | null) ?? [];
    setList(rows);
    if (rows.length > countRef.current) setTimeout(() => endRef.current?.scrollIntoView({ block: 'nearest' }), 50);
    countRef.current = rows.length;
  }, [supabase, code]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 10000);
    return () => clearInterval(poll);
  }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc('post_plan_message', { p_code: code, p_body: text.trim() });
    setBusy(false);
    if (error) return setErr(error.message);
    setText('');
    if (data) notify('plan_message', data as string);
    load();
  }

  async function remove(id: string) {
    await supabase.rpc('delete_plan_message', { p_id: id });
    load();
  }

  if (list === null) return null;
  return (
    <section className="col" style={{ gap: 8 }} aria-label="Replies">
      <span className="eyebrow">Replies{list.length ? ` · ${list.length}` : ''}</span>
      {list.length === 0 && <span className="small">Nothing yet. Running late, bringing someone, want a different time? Say it here.</span>}
      <div className="col plan-replies" style={{ gap: 10 }}>
        {list.map((m) => (
          <div key={m.id} className={m.mine ? 'plan-reply mine' : 'plan-reply'}>
            <span className="small" style={{ fontWeight: 700 }}>
              {m.mine ? 'You' : m.name}
              {m.is_organiser ? ' · organiser' : ''} <span style={{ fontWeight: 400 }}>· {stamp(m.created_at)}</span>
            </span>
            <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}><Linkify text={m.body} /></span>
            {(m.mine || canDelete) && (
              <button className="link-quiet small" onClick={() => remove(m.id)} style={{ alignSelf: 'flex-end' }}>Delete</button>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="row" style={{ gap: 8 }} onSubmit={send}>
        <input className="input grow" maxLength={500} placeholder="Reply to everyone in this plan" value={text} onChange={(e) => setText(e.target.value)} aria-label="Reply" />
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !text.trim()}>Send</button>
      </form>
      {err && <p className="error" role="status" style={{ margin: 0 }}>{err}</p>}
    </section>
  );
}
