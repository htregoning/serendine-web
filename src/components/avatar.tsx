'use client';

import { useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';

type Client = ReturnType<typeof createClient>;

// Photos are fetched once per visit and kept in memory for this page.
const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

export function forgetPhoto(visitId: string) {
  cache.delete(visitId);
  pending.delete(visitId);
}

function loadPhoto(supabase: Client, visitId: string): Promise<string | null> {
  if (cache.has(visitId)) return Promise.resolve(cache.get(visitId) ?? null);
  let p = pending.get(visitId);
  if (!p) {
    p = Promise.resolve(supabase.rpc('visit_photo', { v: visitId })).then(({ data }) => {
      const url = typeof data === 'string' && data.startsWith('data:image/jpeg') ? data : null;
      cache.set(visitId, url);
      pending.delete(visitId);
      return url;
    });
    pending.set(visitId, p);
  }
  return p;
}

type Props = {
  supabase: Client;
  visitId: string;
  alias: string;
  hasPhoto?: boolean;
  size?: number;
  version?: number;
};

export default function Avatar({ supabase, visitId, alias, hasPhoto, size = 44, version = 0 }: Props) {
  const [src, setSrc] = useState<string | null>(hasPhoto ? cache.get(visitId) ?? null : null);

  useEffect(() => {
    let live = true;
    if (!hasPhoto) {
      setSrc(null);
      return;
    }
    loadPhoto(supabase, visitId).then((url) => {
      if (live) setSrc(url);
    });
    return () => {
      live = false;
    };
  }, [supabase, visitId, hasPhoto, version]);

  const box = { width: size, height: size, borderRadius: size / 2, fontSize: Math.round(size * 0.42) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={`Photo of ${alias}`} className="avatar" style={{ ...box, objectFit: 'cover' }} />;
  }
  return (
    <div className="avatar" style={box} aria-hidden="true">
      {alias.charAt(0).toUpperCase()}
    </div>
  );
}
