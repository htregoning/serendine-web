import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { campaignEmail, emailConfigured, sendEmails, unsubscribeUrl } from '@/lib/email';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A manager emails guests who agreed to hear from the venue.
// The database checks the sender manages the venue, picks only opted-in guests and limits sends.
export async function POST(request: Request) {
  if (!emailConfigured()) {
    return NextResponse.json({ error: 'Email sending is not set up yet (Resend key missing in Vercel).' }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { venueId?: string; audience?: string; subject?: string; message?: string };
  const venueId = String(body.venueId ?? '');
  const subject = String(body.subject ?? '').trim();
  const message = String(body.message ?? '').trim();
  if (!UUID.test(venueId) || !subject || !message) return NextResponse.json({ error: 'Add a subject and a message.' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const { data: venue } = await supabase.from('venues').select('name').eq('id', venueId).maybeSingle();
  const max = Math.max(1, Math.min(2000, Number(process.env.CAMPAIGN_MAX_RECIPIENTS) || 100));
  const { data, error } = await supabase.rpc('start_campaign', {
    v: venueId,
    p_audience: body.audience ?? 'all',
    p_subject: subject,
    p_body: message,
    p_max: max,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = (data as { campaign_id: string; user_id: string; email: string; name: string | null }[] | null) ?? [];
  if (rows.length === 0) return NextResponse.json({ error: 'Nobody to send to.' }, { status: 400 });
  const venueName = (venue as { name?: string } | null)?.name ?? 'Your venue';
  const origin = new URL(request.url).origin;

  const emails = rows.map((r) => {
    const unsub = unsubscribeUrl(origin, venueId, r.user_id);
    const { html, text } = campaignEmail(venueName, subject, message, unsub);
    return {
      to: r.email,
      subject,
      html,
      text,
      replyTo: user.email ?? undefined,
      headers: {
        'List-Unsubscribe': `<${unsub.replace('/unsubscribe?', '/api/unsubscribe?')}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };
  });
  const sent = await sendEmails(emails);
  await supabase.rpc('finish_campaign', { p_id: rows[0].campaign_id, p_delivered: sent });
  return NextResponse.json({ sent, total: rows.length });
}
