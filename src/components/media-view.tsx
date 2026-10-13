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

// View-once photos and videos (private chats). The receiver taps to open it full screen, with their
// chat name and the time watermarked across it and no save button. Closing it deletes the file for good.
const SEEN_KEY = 'serendine-seen-once';
function seenOnce(path: string) {
  try {
    return (JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]).includes(path);
  } catch {
    return false;
  }
}
function markSeen(path: string) {
  try {
    const list = (JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]).filter((p) => p !== path).slice(-200);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...list, path]));
  } catch {
    /* private mode */
  }
}

export function ViewOnce({ supabase, payload, mine, viewer }: { supabase: Client; payload: MediaPayload; mine: boolean; viewer: string }) {
  const t = useT();
  const [phase, setPhase] = useState<'closed' | 'loading' | 'open' | 'done' | 'gone'>('closed');
  const [url, setUrl] = useState<string | null>(null);
  const [stamp, setStamp] = useState('');
  const isVideo = payload.kind === 'video';

  useEffect(() => {
    if (!mine && seenOnce(payload.path)) setPhase('done');
  }, [mine, payload.path]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function open() {
    setPhase('loading');
    const { data, error } = await supabase.storage.from('chat-media').download(payload.path);
    if (error || !data) return setPhase('gone');
    try {
      const b = await decryptBlob(data, payload.key, payload.iv, payload.mime);
      setUrl(URL.createObjectURL(b));
      setStamp(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
      setPhase('open');
    } catch {
      setPhase('gone');
    }
  }

  async function close() {
    markSeen(payload.path);
    setPhase('done');
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    await supabase.storage.from('chat-media').remove([payload.path]);
  }

  const label = isVideo ? t('View-once video') : t('View-once photo');
  if (mine) {
    return (
      <div className="once-card">
        <span className="once-icon" aria-hidden="true">①</span>
        <span>{label} · {t('sent')}</span>
      </div>
    );
  }
  if (phase === 'done' || phase === 'gone') {
    return (
      <div className="once-card once-used">
        <span className="once-icon" aria-hidden="true">①</span>
        <span>{label} · {phase === 'done' ? t('opened') : t('no longer available')}</span>
      </div>
    );
  }
  const mark = `${viewer} · ${stamp}`;
  return (
    <>
      <button className="once-card once-ready" onClick={open} disabled={phase === 'loading'}>
        <span className="once-icon" aria-hidden="true">①</span>
        <span>{phase === 'loading' ? t('Opening…') : `${label} · ${t('tap to open')}`}</span>
      </button>
      {phase === 'open' && url && (
        <div className="media-lightbox once-view" role="dialog" aria-label={label} onContextMenu={(e) => e.preventDefault()}>
          <div className="once-frame">
            {isVideo ? (
              <video src={url} autoPlay playsInline controls controlsList="nodownload noplaybackrate" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} />
            ) : (
              <div className="once-img" style={{ backgroundImage: `url(${url})`, aspectRatio: payload.w && payload.h ? `${payload.w} / ${payload.h}` : '3 / 4' }} role="img" aria-label={t('Shared photo')} />
            )}
            <div className="once-mark" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => <span key={i}>{mark}</span>)}
            </div>
          </div>
          <span className="small" style={{ color: '#fff', textAlign: 'center' }}>{t('This disappears when you close it.')}</span>
          <button className="btn btn-primary btn-sm" onClick={close}>{t('Close')}</button>
        </div>
      )}
    </>
  );
}

// The paperclip-style button that opens the camera or photo library.
// Camera button: take a photo, record a video, or choose from the gallery.
// (A plain file picker on Android only offers the gallery, so the camera options are separate.)
export function AttachButton({ onFile, disabled, allowOnce = false }: { onFile: (f: File, once: boolean) => void; disabled?: boolean; allowOnce?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [once, setOnce] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const pick = (accept: string, capture: boolean, label: string) => (
    <label className="attach-option">
      {label}
      <input
        type="file"
        accept={accept}
        {...(capture ? { capture: 'environment' as const } : {})}
        hidden
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          setOpen(false);
          if (f) onFile(f, allowOnce && once);
        }}
      />
    </label>
  );

  return (
    <div className="attach-wrap">
      <button
        type="button"
        className="attach-btn"
        aria-label={t('Add a photo or video')}
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
      </button>
      {open && (
        <>
          <div className="attach-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="attach-menu" role="menu">
            {allowOnce && (
              <label className="attach-option attach-once">
                <input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} />
                <span className="col" style={{ gap: 0 }}>
                  <span>{t('View once')}</span>
                  <span className="small" style={{ fontWeight: 400 }}>{t('They can open it once. No saving.')}</span>
                </span>
              </label>
            )}
            {pick('image/*', true, t('Take a photo'))}
            {pick('video/*', true, t('Record a video'))}
            {pick('image/*,video/*', false, t('Choose from gallery'))}
          </div>
        </>
      )}
    </div>
  );
}
