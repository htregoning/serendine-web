import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { emailConfigured, reportEmail, sendEmails, type WeekNumbers } from '@/lib/email';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Email me this week's report": sends the venue's last 7 days to the signed-in manager.
export async function POST(request: Request) {
  if (!emailConfigured()) {
    return NextResponse.json({ error: 'Email sending is not set up yet (Resend key missing in Vercel).' }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { venueId?: string };
  const venueId = String(body.venueId ?? '');
  if (!UUID.test(venueId)) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const [{ data, error }, { data: v }] = await Promise.all([
    supabase.rpc('venue_report', { v: venueId, p_days: 7 }),
    supabase.from('venues').select('slug').eq('id', venueId).maybeSingle(),
  ]);
  const row = ((data as (WeekNumbers & { venue_name: string })[] | null) ?? [])[0];
  if (error || !row) return NextResponse.json({ error: 'Managers only.' }, { status: 403 });

  const origin = new URL(request.url).origin;
  const slug = (v as { slug?: string } | null)?.slug ?? '';
  const mail = reportEmail(row.venue_name, row, `${origin}/staff/guests?v=${slug}`);
  const sent = await sendEmails([{ to: user.email, ...mail }]);
  return NextResponse.json({ sent, to: user.email });
}
