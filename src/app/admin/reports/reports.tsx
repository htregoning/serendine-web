'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MediaView from '@/components/media-view';
import type { MediaKind } from '@/lib/media';

type Report = {
  id: string;
  created_at: string;
  reason: string | null;
  evidence: unknown;
  reporter_email: string | null;
  reported_user: string;
  reported_email: string | null;
  reports_against: number;
  banned: boolean;
  resolved_at: string | null;
};

type Item = { from?: string; text?: string; media?: { path: string; key: string; iv: string; mime: string; kind: MediaKind } };

function Evidence({ value, supabase }: { value: unknown; supabase: ReturnType<typeof createClient> }) {
  if (!value) return <span className="small">No messages included.</span>;
  if (Array.isArray(value)) {
    return (
      <div className="col" style={{ gap: 4 }}>
        {(value as Item[]).map((m, i) => (
          <div key={i} className="small" style={{ color: m.from === 'them' ? 'var(--text)' : 'var(--faint)' }}>
            <b>{m.from === 'them' ? 'Reported person' : 'Reporter'}:</b> {m.media ? `[${m.media.kind === 'video' ? 'video' : 'photo'}] ` : ''}{m.text}
            {m.media && (
              <div style={{ maxWidth: 260, marginTop: 4 }}>
                <MediaView supabase={supabase} src={{ bucket: 'chat-media', payload: { $m: 1, ...m.media } }} />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
  const g = value as { group_message?: string; group_media?: string; kind?: MediaKind };
  if (g.group_message || g.group_media) {
    return (
      <div className="small">
        <b>Group chat {g.group_media ? (g.kind === 'video' ? 'video' : 'photo') : 'message'}:</b> {g.group_message ?? ''}
        {g.group_media && (
          <div style={{ maxWidth: 260, marginTop: 4 }}>
            <MediaView supabase={supabase} src={{ bucket: 'group-media', path: g.group_media, kind: g.kind ?? 'image' }} />
          </div>
        )}
      </div>
    );
  }
  return <span className="small">{JSON.stringify(value)}</span>;
}

export default function Reports() {
  const [supabase] = useState(() => createClient());
  const [openOnly, setOpenOnly] = useState(true);
  const [list, setList] = useState<Report[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('admin_reports', { p_open_only: openOnly });
    setList((data as Report[] | null) ?? []);
  }, [supabase, openOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: string) {
    await supabase.rpc('admin_resolve_report', { p_id: id });
    setMsg('Marked as handled.');
    load();
  }

  async function ban(r: Report) {
    const reason = window.prompt(`Ban ${r.reported_email ?? 'this person'}? Reason (kept on record):`, r.reason ?? '');
    if (reason === null) return;
    const { error } = await supabase.rpc('admin_ban', { p_user: r.reported_user, p_reason: reason });
    setMsg(error ? error.message : `${r.reported_email ?? 'Account'} banned. They've been checked out and can't check in again.`);
    load();
  }

  async function unban(r: Report) {
    await supabase.rpc('admin_unban', { p_user: r.reported_user });
    setMsg(`${r.reported_email ?? 'Account'} unbanned.`);
    load();
  }

  return (
    <main className="admin">
      <header className="admin-head">
        <Link href="/admin" className="small">← All venues</Link>
        <div className="grow" />
        <label className="check">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          <span>Only open reports</span>
        </label>
      </header>
      <h1 className="display" style={{ fontSize: 30 }}>Reports</h1>
      <p className="small">
        Messages shown here were sent in by the person reporting. Private chats are encrypted, so this is the only way we can
        see them.
      </p>
      {msg && <p className="card small" role="status">{msg}</p>}
      {list === null && <p className="small">Loading…</p>}
      {list?.length === 0 && <p className="card small">Nothing to review.</p>}
      {list?.map((r) => (
        <article key={r.id} className="card col" style={{ gap: 10 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <strong className="grow">{r.reported_email ?? 'Unknown account'}</strong>
            <span className="small">{new Date(r.created_at).toLocaleString()}</span>
          </div>
          <span className="small">
            Reported by {r.reporter_email ?? 'unknown'} · {r.reports_against} report{r.reports_against === 1 ? '' : 's'} against this
            account{r.banned ? ' · BANNED' : ''}
          </span>
          {r.reason && <span><b>Reason:</b> {r.reason}</span>}
          <Evidence value={r.evidence} supabase={supabase} />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {!r.resolved_at && <button className="btn btn-ghost btn-sm" onClick={() => resolve(r.id)}>Mark handled</button>}
            {r.banned ? (
              <button className="btn btn-ghost btn-sm" onClick={() => unban(r)}>Unban</button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => ban(r)}>Ban account</button>
            )}
          </div>
        </article>
      ))}
    </main>
  );
}
