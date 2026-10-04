import { timingSafeEqual } from 'node:crypto';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { unsubscribeSig } from '@/lib/email';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validUnsubscribe(v: string, u: string, s: string) {
  if (!UUID.test(v) || !UUID.test(u) || !s) return false;
  const expected = unsubscribeSig(v, u);
  return expected.length === s.length && timingSafeEqual(Buffer.from(expected), Buffer.from(s));
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

export async function venueName(v: string) {
  const a = admin();
  if (!a) return null;
  const { data } = await a.from('venues').select('name').eq('id', v).maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}

export async function recordUnsubscribe(v: string, u: string) {
  const a = admin();
  if (!a) return false;
  const { error } = await a.from('venue_unsubscribes').upsert({ venue_id: v, user_id: u }, { onConflict: 'venue_id,user_id' });
  return !error;
}
