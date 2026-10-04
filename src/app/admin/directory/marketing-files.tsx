'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type FileRow = { name: string; created_at: string | null; metadata: { size?: number } | null };

const size = (n?: number) =>
  !n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

// A private folder for marketing files: decks, spreadsheets, flyers, photos.
export default function MarketingFiles() {
  const [supabase] = useState(() => createClient());
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.storage.from('marketing').list('', { sortBy: { column: 'created_at', order: 'desc' } });
    if (error) {
      setMsg('The files folder needs the latest database update (0015).');
      setFiles([]);
      return;
    }
    setFiles(((data as FileRow[] | null) ?? []).filter((f) => f.name !== '.emptyFolderPlaceholder'));
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setMsg(null);
    let ok = 0;
    for (const f of Array.from(list)) {
      const clean = f.name.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, ' ').trim() || 'file';
      const { error } = await supabase.storage.from('marketing').upload(clean, f, { upsert: true, contentType: f.type || undefined });
      if (!error) ok++;
    }
    setBusy(false);
    setMsg(ok === list.length ? `Saved ${ok} file${ok === 1 ? '' : 's'}.` : `Saved ${ok} of ${list.length}. Files must be under 50 MB.`);
    load();
  }

  async function open(name: string) {
    const { data } = await supabase.storage.from('marketing').createSignedUrl(name, 300, { download: name });
    if (data?.signedUrl) window.location.href = data.signedUrl;
  }

  async function remove(name: string) {
    setConfirm(null);
    await supabase.storage.from('marketing').remove([name]);
    setMsg(`${name} deleted.`);
    load();
  }

  return (
    <section className="card col" style={{ gap: 12 }} aria-label="Marketing files">
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 className="dir-title grow" style={{ margin: 0 }}>Marketing files</h2>
        <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
          {busy ? 'Saving…' : 'Add files'}
          <input
            type="file"
            multiple
            hidden
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <span className="small">
        Keep the income spreadsheet, exported decks (PDF or PowerPoint), flyers and photos here. Private to you.
      </span>
      {msg && <span className="small" role="status">{msg}</span>}
      {files === null && <span className="small">Loading…</span>}
      {files?.length === 0 && !msg && <span className="small">No files yet.</span>}
      {files?.map((f) => (
        <div key={f.name} className="row dir-file" style={{ gap: 8, alignItems: 'center' }}>
          <button className="dir-file-name grow" onClick={() => open(f.name)}>{f.name}</button>
          <span className="small">{size(f.metadata?.size)}</span>
          {confirm === f.name ? (
            <>
              <button className="link-danger" onClick={() => remove(f.name)}>Delete</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>Keep</button>
            </>
          ) : (
            <button className="link-danger" onClick={() => setConfirm(f.name)} aria-label={`Delete ${f.name}`}>Delete</button>
          )}
        </div>
      ))}
    </section>
  );
}
