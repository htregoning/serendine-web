'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { alertGuest } from '@/lib/alerts';
import type { ChatMode } from '@/lib/types';
import Chat, { type Conv } from '../t/[token]/room/chat';

type Connection = {
  conversation_id: string;
  my_visit: string;
  partner_visit: string;
  partner_alias: string;
  partner_mode: ChatMode;
  partner_key: string | null;
  venue_name: string;
  met_at: string;
  last_at: string;
};

function toConv(c: Connection): Conv {
  return {
    conversation_id: c.conversation_id,
    partner_visit: c.partner_visit,
    partner_alias: c.partner_alias,
    partner_mode: c.partner_mode,
    partner_zone: `Met at ${c.venue_name}`,
    partner_key: c.partner_key,
    i_share: false,
    they_share: false,
    i_keep: true,
    they_keep: true,
    last_at: c.last_at,
  };
}

export default function Connections() {
  const [supabase] = useState(() => createClient());
  const [list, setList] = useState<Connection[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const mine = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_connections');
    const rows = (data as Connection[] | null) ?? [];
    mine.current = new Set(rows.map((r) => r.my_visit));
    setList(rows);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('connections')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as { conversation_id: string; sender_visit: string };
        if (!mine.current.has(m.sender_visit) && (document.hidden || m.conversation_id !== activeId)) alertGuest();
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load, activeId]);

  async function remove(id: string) {
    await supabase.rpc('remove_connection', { c: id });
    setConfirmId(null);
    setNote('Connection removed. The chat is deleted for both of you.');
    load();
  }

  const active = list?.find((c) => c.conversation_id === activeId);
  if (active) {
    return (
      <Chat
        supabase={supabase}
        conv={toConv(active)}
        myVisitId={active.my_visit}
        myTable=""
        context="connection"
        backLabel="Back to connections"
        onBack={() => setActiveId(null)}
        onChanged={load}
        onRemoved={(msg) => {
          setActiveId(null);
          setNote(msg);
          load();
        }}
      />
    );
  }

  return (
    <main className="shell">
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>Serendine</div>
      <h1 className="display">Your connections</h1>
      <p className="lede">People you both chose to keep in touch with. Swap whatever contact details you like in the chat.</p>
      {note && <p className="card small" role="status">{note}</p>}
      {list === null && <p className="small">Loading…</p>}
      {list?.length === 0 && (
        <p className="card small">
          No connections yet. In a chat at a venue, tap &quot;Ask to keep in touch&quot;. When you both agree, they appear here.
        </p>
      )}
      {list?.map((c) => (
        <div key={c.conversation_id} className="card col" style={{ gap: 10 }}>
          <button className="row" style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'left' }} onClick={() => setActiveId(c.conversation_id)}>
            <div className="avatar">{c.partner_alias.charAt(0).toUpperCase()}</div>
            <div className="col grow" style={{ gap: 3 }}>
              <strong>{c.partner_alias}</strong>
              <span className="small">
                Met at {c.venue_name} · {new Date(c.met_at).toLocaleDateString()}
              </span>
            </div>
            <span aria-hidden>›</span>
          </button>
          {confirmId === c.conversation_id ? (
            <div className="row" style={{ gap: 8 }}>
              <span className="small grow">Remove {c.partner_alias}? The chat is deleted for both of you.</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={() => remove(c.conversation_id)}>Remove</button>
            </div>
          ) : (
            <button className="link-danger" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setConfirmId(c.conversation_id)}>
              Remove connection
            </button>
          )}
        </div>
      ))}
      <Link href="/" className="small">← Serendine home</Link>
    </main>
  );
}
