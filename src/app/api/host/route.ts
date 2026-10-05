import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { hostConfigured, writeHostMessage, type HostContext } from '@/lib/host-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guests' phones call this when the group chat has gone quiet, or after someone mentions Seren.
// The database decides whether Seren should speak (venue switched on, enough tables, pacing),
// so many phones calling at once still produce at most one message.
export async function POST(request: Request) {
  if (!hostConfigured()) return NextResponse.json({ posted: false });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ posted: false });

  const body = (await request.json().catch(() => ({}))) as { venueId?: string; reason?: string };
  const venueId = String(body.venueId ?? '');
  const reason = body.reason === 'mention' ? 'mention' : body.reason === 'quiet' ? 'quiet' : null;
  if (!UUID.test(venueId) || !reason) return NextResponse.json({ posted: false }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ posted: false }, { status: 401 });

  const admin = createAdminClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.rpc('host_claim', { v: venueId, p_user: user.id, p_reason: reason });
  if (error) {
    console.error('host: claim failed', error.message);
    return NextResponse.json({ posted: false });
  }
  const ctx = ((data as HostContext[] | null) ?? [])[0];
  if (!ctx) return NextResponse.json({ posted: false });

  const text = await writeHostMessage(ctx, reason);
  if (!text) return NextResponse.json({ posted: false });
  const { error: postError } = await admin.rpc('host_post', { v: venueId, p_body: text });
  if (postError) console.error('host: post failed', postError.message);
  return NextResponse.json({ posted: !postError });
}
