'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { decryptBlob, saveOrShare, type MediaKind, type MediaPayload } from '@/lib/media';
import { useT } from '@/components/lang';

type Client = ReturnType<typeof createClient>;
type Source =
  | { bucket: 'chat-media'; payload: MediaPayload }
  | { bucket: 'group-media'; path: string; kind: MediaKind };

// Downloads (and for private chats, decrypts) a photo or video, then shows it.
function useMedia(supabase: Client, src: Source) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading');
  const path = src.bucket === 'chat-media' ? src.payload.path : src.path;

  useEffect(() => {
    let live = true;
    let made: string | null = null;
    (async () => {
      const { data, error } = await supabase.storage.from(src.bucket).download(path);
      if (error || !data) {
        if (live) setState('gone');
        return;
      }
      try {
        const b =
          src.bucket === 'chat-media'
            ? await decryptBlob(data, src.payload.key, src.payload.iv, src.payload.mime)
            : data;
        if (!live) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setUrl(made);
        setState('ready');
      } catch {
        if (live) setState('gone');
      }
    })();
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, src.bucket, path]);

  return { blob, url, state };
}

export default function MediaView({
  supabase,
  src,
  blurred = false,
  onReveal,
}: {
  supabase: Client;
  src: Source;
  blurred?: boolean;
  onReveal?: () => void;
}) {
  const t = useT();
  const kind = src.bucket === 'chat-media' ? src.payload.kind : src.kind;
  const { blob, url, state } = useMedia(supabase, src);
  const [open, setOpen] = useState(false);
  const ratio = src.bucket === 'chat-media' && src.payload.w && src.payload.h ? `${src.payload.w} / ${src.payload.h}` : undefined;

  if (state === 'gone') {
    return (
      <div className="media-gone small">
        {kind === 'video' ? t('This video has expired or was removed.') : t('This photo has expired or was removed.')}
      </div>
    );
  }
  if (state === 'loading' || !url) {
    return <div className="media-box media-loading" style={{ aspectRatio: ratio ?? '4 / 3' }} aria-label={t('Loading…')} />;
  }

  if (blurred) {
    return (
      <button className="media-box media-blur" style={{ aspectRatio: ratio }} onClick={onReveal}>
        {kind === 'video' ? <video src={url} muted playsInline preload="metadata" /> : <img src={url} alt="" />}
        <span className="media-blur-label">
          {kind === 'video' ? t('Tap to see the video') : t('Tap to see the photo')}
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="media-box" style={{ aspectRatio: ratio }}>
        {kind === 'video' ? (
          <video src={url} controls playsInline preload="metadata" />
        ) : (
          <button className="media-open" onClick={() => setOpen(true)} aria-label={t('Open photo')}>
            <img src={url} alt={t('Shared photo')} />
          </button>
        )}
        <button className="media-save" onClick={() => blob && saveOrShare(blob, kind)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
          {t('Save or share')}
        </button>
      </div>
      {open && (
        <div className="media-lightbox" role="dialog" aria-label={t('Photo')} onClick={() => setOpen(false)}>
          <img src={url} alt={t('Shared photo')} />
          <div className="row" style={{ gap: 10 }} onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-primary btn-sm" onClick={() => blob && saveOrShare(blob, kind)}>{t('Save or share')}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>{t('Close')}</button>
          </div>
        </div>
      )}
    </>
  );
}

// The paperclip-style button that opens the camera or photo library.
export function AttachButton({ onFile, disabled }: { onFile: (f: File) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <label className="attach-btn" aria-label={t('Add a photo or video')} aria-disabled={disabled || undefined}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
      <input
        type="file"
        accept="image/*,video/*"
        hidden
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </label>
  );
}
