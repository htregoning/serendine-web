import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Every night (see vercel.json) Vercel calls this to delete old photos and videos:
// private chat files after 7 days, group chat files after a day.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ ok: false, problem: 'Supabase service key missing' });

  const admin = createAdminClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.rpc('expired_media');
  if (error) return NextResponse.json({ ok: false, problem: error.message });

  const rows = (data as { bucket: string; path: string }[] | null) ?? [];
  const byBucket = new Map<string, string[]>();
  for (const r of rows) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r.path]);

  let removed = 0;
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += 100) {
      const { data: gone } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
      removed += gone?.length ?? 0;
    }
  }
  return NextResponse.json({ ok: true, removed });
}
